'use client';

import { useEffect, useMemo, useState } from 'react';
import Molstar from './Molstar';
import type { Case } from '@/lib/data';
import { nearestReps, type Alignment } from '@/lib/nearest';

const CASE = '#2f81f7';
const REP = '#e16f24';
const UNALIGNED = '#d0d7de';

/**
 * The manual reps closest to this domain, to judge demote: the rep's own boundaries next to this
 * domain's, how much of each the structural alignment covers, and the rep superposed on the domain.
 * Evidence only (no verdict), so the blind pilot view shows it too.
 */
export default function NearestRep({ c }: { c: Case }) {
  const cands = useMemo(() => nearestReps(c), [c]);
  const [sel, setSel] = useState(0);
  const [aln, setAln] = useState<Alignment | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const n = c.residues.length;
  const cand = cands[sel];

  useEffect(() => {
    if (!cand) return;
    let dead = false;
    setAln(null);
    setErr(null);
    fetch(`/api/align/${c.ecod_uid}/${cand.target_uid}`).then((r) => r.json()).then((j) => {
      if (dead) return;
      if (j.error) setErr(j.error); else setAln(j);
    }).catch((e) => { if (!dead) setErr(String(e)); });
    return () => { dead = true; };
  }, [c.ecod_uid, cand]);

  if (!cand) return null;
  const pos = (i: number) => { const r = c.residues[i - 1]; return r ? `${r[0]}:${r[1]}` : String(i); };
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  return (
    <>
      <h2>Nearest manual rep <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>
        is this domain already represented?</span></h2>
      <div className="filters" style={{ marginTop: 0 }}>
        {cands.map((x, i) => (
          <button key={x.target} className="btn" aria-pressed={sel === i} onClick={() => setSel(i)}
            title={`${x.target_f} ${x.target_f_name}`}>
            {x.target} <span className="muted">{x.pid}% &middot; {pct(x.tcov)} of rep</span>
          </button>
        ))}
      </div>
      <div className="grid2">
        <div>
          <Molstar uid={c.ecod_uid} residues={c.residues} height={360}
            ranges={aln ? [{ start: aln.qstart, end: aln.qend, color: CASE }] : []}
            overlay={aln ? { uid: cand.target_uid, rotation: aln.rotation, translation: aln.translation, color: REP } : null}
            caption={<><span style={{ color: CASE }}>■</span> this domain (aligned part) &nbsp;
              <span style={{ color: REP }}>■</span> {cand.target} superposed</>} />
        </div>
        <div style={{ fontSize: 13 }}>
          <div className="panel" style={{ padding: 12 }}>
            <div><span className="mono">{cand.target}</span>{' '}
              <span className="muted">{cand.target_h} &middot; F {cand.target_f} {cand.target_f_name}</span>
              {cand.target_h !== c.h_id && <span className="tag b-bad" style={{ marginLeft: 8 }}>other H-group</span>}</div>
            {aln?.rep && <div className="muted" style={{ marginTop: 4 }}>
              {aln.rep.h_name} &middot; {aln.rep.t_name} &middot; {aln.rep.type}</div>}
            <table style={{ marginTop: 8 }}>
              <thead><tr><th /><th>this domain</th><th>{cand.target}</th></tr></thead>
              <tbody>
                <tr><td className="muted">range</td><td className="mono">{c.range_definition}</td>
                  <td className="mono">{aln?.rep?.range ?? ''}</td></tr>
                <tr><td className="muted">length</td><td>{n}</td><td>{aln?.rep?.length ?? cand.target_len}</td></tr>
                {aln && <>
                  <tr><td className="muted">aligned</td>
                    <td className="mono">{pos(aln.qstart)}–{pos(aln.qend)} ({pct((aln.qend - aln.qstart + 1) / n)})</td>
                    <td>{aln.tstart}–{aln.tend} of {aln.tlen} ({pct((aln.tend - aln.tstart + 1) / aln.tlen)})</td></tr>
                  <tr><td className="muted">left over</td>
                    <td>N {aln.qstart - 1}, C {n - aln.qend}</td>
                    <td>N {aln.tstart - 1}, C {aln.tlen - aln.tend}</td></tr>
                  <tr><td className="muted">TM-score</td><td>{aln.qtm.toFixed(2)}</td><td>{aln.ttm.toFixed(2)}</td></tr>
                </>}
              </tbody>
            </table>
            {aln && <Bars n={n} a={aln} />}
            <div className="muted" style={{ marginTop: 8 }}>
              {aln && <>structural alignment: {pct(aln.fident)} identity, lDDT {aln.lddt.toFixed(2)}<br /></>}
              {cand.seq && <>MMseqs2: {cand.seq.pid}% identity over {pct(cand.seq.tcov)} of the rep,
                this domain {pos(cand.seq.qs)}–{pos(cand.seq.qe)}<br /></>}
              {cand.struct && <>Foldseek: probability {cand.struct.prob}, TM {cand.struct.tm}, {cand.struct.pid}% identity
                over {pct(cand.struct.tcov)} of the rep</>}
            </div>
            {!aln && !err && <div className="muted" style={{ marginTop: 8 }}>aligning with Foldseek (TM-align mode)...</div>}
            {err && <div style={{ color: 'var(--bad)', marginTop: 8 }}>alignment failed: {err}</div>}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Candidates: reps whose hit covers at least half of this domain and half of the rep, by identity;
            then the rest by coverage. A whole-domain match at high identity means the domain is already represented.
          </div>
        </div>
      </div>
    </>
  );
}

/** Both domains as bars, offset so the aligned stretches line up. */
function Bars({ n, a }: { n: number; a: Alignment }) {
  const shift = (a.qstart - 1) - (a.tstart - 1);         // rep start relative to case start
  const lo = Math.min(0, shift);
  const hi = Math.max(n, shift + a.tlen);
  const W = 400;
  const x = (v: number) => ((v - lo) / (hi - lo)) * W;
  return (
    <svg viewBox={`0 0 ${W} 44`} style={{ width: '100%', maxWidth: 480, marginTop: 8 }} role="img"
      aria-label="Aligned extent of the domain and the manual rep">
      <rect x={x(0)} y={4} width={x(n) - x(0)} height={12} fill={UNALIGNED} rx={2} />
      <rect x={x(a.qstart - 1)} y={4} width={x(a.qend) - x(a.qstart - 1)} height={12} fill={CASE} rx={2} />
      <rect x={x(shift)} y={26} width={x(shift + a.tlen) - x(shift)} height={12} fill={UNALIGNED} rx={2} />
      <rect x={x(shift + a.tstart - 1)} y={26} width={x(shift + a.tend) - x(shift + a.tstart - 1)} height={12} fill={REP} rx={2} />
    </svg>
  );
}
