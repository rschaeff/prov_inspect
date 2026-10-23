import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { DATA_DIR, domainPdbPath, getCase } from '@/lib/data';
import type { Alignment } from '@/lib/nearest';

const run = promisify(execFile);
const FOLDSEEK = process.env.FOLDSEEK || '/sw/apps/Anaconda3-2023.09-0/bin/foldseek';

type Rep = NonNullable<Alignment['rep']>;
let reps: Promise<{ byUid: Map<string, Omit<Rep, 'h_name' | 't_name' | 'f_name'>>; names: Map<string, string> }> | null = null;

/** Manual reps' boundaries and names from the snapshot's reps.tsv and cluster_names.tsv. */
function repTable() {
  reps ??= (async () => {
    const byUid = new Map<string, Omit<Rep, 'h_name' | 't_name' | 'f_name'>>();
    const lines = (await readFile(path.join(DATA_DIR, 'reps.tsv'), 'utf8')).split('\n');
    const col = Object.fromEntries(lines[0].split('\t').map((k, i) => [k, i]));
    for (const line of lines.slice(1)) {
      const f = line.split('\t');
      if (f[col.rep_kind] !== 'manual') continue;
      byUid.set(f[col.ecod_uid], {
        domain_id: f[col.ecod_domain_id], range: f[col.range_definition], length: Number(f[col.length]),
        type: f[col.type], h: f[col.h_id], t: f[col.t_id], f: f[col.f_id],
      });
    }
    const names = new Map<string, string>();
    for (const line of (await readFile(path.join(DATA_DIR, 'features', 'cluster_names.tsv'), 'utf8')).split('\n').slice(1)) {
      const [id, name] = line.split('\t');
      if (id) names.set(id, name ?? '');
    }
    return { byUid, names };
  })();
  return reps;
}

const cache = new Map<string, Alignment>();

/**
 * Foldseek in TM-align mode between a case's domain file and one manual rep among its hits: the
 * aligned stretch on each side, TM-scores both ways, and the superposition putting the rep in the
 * case's frame (Foldseek's u,t map the target onto the query). Computed on demand from the same
 * files the snapshot used; only reps among the case's own hits are accepted.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ uid: string; target: string }> }) {
  const { uid, target } = await ctx.params;
  if (!/^\d{1,10}$/.test(uid) || !/^\d{1,10}$/.test(target)) return Response.json({ error: 'bad ids' }, { status: 400 });
  const key = `${uid}:${target}`;
  if (cache.has(key)) return Response.json(cache.get(key));
  const c = await getCase(uid);
  if (!c) return Response.json({ error: 'no such case' }, { status: 404 });
  if (!c.hits.some((h) => h.target_uid === target)) return Response.json({ error: 'not among this case\'s hits' }, { status: 400 });
  const q = domainPdbPath(parseInt(uid, 10));
  const t = domainPdbPath(parseInt(target, 10));
  if (!existsSync(q) || !existsSync(t)) return Response.json({ error: 'structure file missing' }, { status: 404 });

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'prov_align_'));
  let row: string[];
  try {
    const env = { ...process.env };
    delete env.OMP_PROC_BIND;
    await run(FOLDSEEK, ['easy-search', q, t, path.join(tmp, 'aln.m8'), path.join(tmp, 'fs'),
      '--exhaustive-search', '1', '--alignment-type', '1', '-e', 'inf', '--threads', '1', '--format-output',
      'qstart,qend,qlen,tstart,tend,tlen,fident,qtmscore,ttmscore,lddt,u,t,query'], { env, timeout: 60_000 });
    row = (await readFile(path.join(tmp, 'aln.m8'), 'utf8')).split('\n')[0].split('\t');
  } catch (e) {
    return Response.json({ error: `foldseek failed: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  if (row.length < 13) return Response.json({ error: 'no alignment' }, { status: 200 });
  const [qs0, qe0, ql, ts, te, tl, fid, qtm, ttm, lddt] = row.slice(0, 10).map(Number);
  // a multi-chain domain file is split into one entry per chain (name_X): positions are within that chain
  const m = row[12].match(/_([A-Za-z0-9])$/);
  const off = m && new Set(c.residues.map((x) => x[0])).size > 1 ? c.residues.findIndex((x) => x[0] === m[1]) : 0;
  const qs = qs0 + Math.max(0, off);
  const qe = qe0 + Math.max(0, off);
  const u = row[10].split(',').map(Number);
  const { byUid, names } = await repTable();
  const r = byUid.get(target);
  const out: Alignment = {
    qstart: qs, qend: qe, qlen: ql, tstart: ts, tend: te, tlen: tl, fident: fid, qtm, ttm, lddt,
    // row-major U -> column-major for MolViewSpec
    rotation: [u[0], u[3], u[6], u[1], u[4], u[7], u[2], u[5], u[8]],
    translation: row[11].split(',').map(Number),
    rep: r ? { ...r, h_name: names.get(r.h) ?? '', t_name: names.get(r.t) ?? '', f_name: names.get(r.f) ?? '' } : null,
  };
  cache.set(key, out);
  return Response.json(out);
}
