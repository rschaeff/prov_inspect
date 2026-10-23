'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Molstar, { type ColorRange } from './Molstar';
import NearestRep from './NearestRep';
import type { Case, Hit, Piece } from '@/lib/data';
import { blocksOf, complement, partsOf } from '@/lib/parts';
import type { ParsedDomain } from '@/lib/ranges';

const PIECE = ['#2f81f7', '#e16f24', '#1a7f37', '#8250df', '#bf3989', '#0f8b8d', '#9a6700', '#cf222e'];
const UNASSIGNED = '#57606a';
const LINKER = '#d0d7de';
const TRIM = '#8250df';
const DROPPED = '#cf222e';
const SRC = { struct: '#2f81f7', seq: '#e16f24' };

/** AlphaFold's own pLDDT bands, so the strip reads like every other AF view. */
function plddtColor(v: number) {
  return v >= 90 ? '#0053d6' : v >= 70 ? '#65cbf3' : v >= 50 ? '#ffdb13' : '#ff7d45';
}

function pieceColors(pieces: Piece[]) {
  let k = 0;
  return pieces.map((p) => (p.status === 'linker_or_disorder' ? LINKER
    : p.status === 'unassigned_domain' ? UNASSIGNED : PIECE[k++ % PIECE.length]));
}

type Mode = 'split' | 'trim' | 'plddt' | 'hit' | 'mine';

/**
 * blind: the pilot's labeling view. The proposals' geometry and measurements stay; every verdict the
 * pipeline reached (recommended option, viable / not viable, strong retire) is hidden, and the view
 * opens on pLDDT rather than on whichever proposal the pipeline favoured.
 * mine: boundaries the curator is typing, drawn on the structure and the track as they go.
 */
export default function CaseView({ c, blind = false, mine = null }: {
  c: Case; blind?: boolean; mine?: ParsedDomain[] | null;
}) {
  const n = c.residues.length;
  const split = c.options.split;
  const trim = c.options.trim;
  const hasPlddt = c.residues.some((r) => r[3] !== null);
  const [mode, setMode] = useState<Mode>(blind ? (hasPlddt ? 'plddt' : split ? 'split' : 'trim')
    : split?.viable ? 'split' : trim ? 'trim' : hasPlddt ? 'plddt' : 'split');
  const [hit, setHit] = useState<Hit | null>(null);
  const splitColors = useMemo(() => (split ? pieceColors(split.pieces) : []), [split]);
  const mineKey = mine?.map((d) => d.range).join(';') ?? '';
  useEffect(() => { if (mineKey) setMode('mine'); }, [mineKey]);

  const ranges: ColorRange[] = useMemo(() => {
    if (mode === 'split' && split) {
      return split.pieces.flatMap((p, i) => partsOf(p).map(([start, end]) => ({ start, end, color: splitColors[i] })));
    }
    if (mode === 'trim' && trim) {
      const kept = partsOf(trim.piece);
      return [...kept.map(([start, end]) => ({ start, end, color: TRIM })),
        ...complement(kept, n).map(([start, end]) => ({ start, end, color: DROPPED }))];
    }
    if (mode === 'plddt' && hasPlddt) {
      // contiguous runs of one band, so the scene stays a handful of selectors
      const out: ColorRange[] = [];
      c.residues.forEach((r, i) => {
        const col = plddtColor(r[3] ?? 0);
        const last = out[out.length - 1];
        if (last && last.color === col && last.end === i) last.end = i + 1;
        else out.push({ start: i + 1, end: i + 1, color: col });
      });
      return out;
    }
    if (mode === 'hit' && hit) return blocksOf(hit).map(([start, end]) => ({ start, end, color: SRC[hit.src] }));
    if (mode === 'mine' && mine) {
      return mine.flatMap((d, i) => d.segments.map((g) => ({ ...g, color: PIECE[i % PIECE.length] })));
    }
    return [];
  }, [mode, split, trim, hit, splitColors, hasPlddt, c.residues, n, mine]);

  const pos = (i: number) => {
    const r = c.residues[i - 1];
    return r ? `${r[0]}:${r[1]}` : String(i);
  };

  return (
    <>
      <div className="grid2">
        <div>
          <div className="filters" style={{ marginTop: 0 }}>
            <span className="muted">colour by</span>
            {(['split', 'trim', 'plddt'] as Mode[]).map((m) => (
              <button key={m} className="btn" aria-pressed={mode === m} onClick={() => setMode(m)}
                disabled={(m === 'split' && !split) || (m === 'trim' && !trim) || (m === 'plddt' && !hasPlddt)}>
                {m === 'plddt' ? 'pLDDT' : `${m} proposal`}
              </button>
            ))}
            {hit && <button className="btn" aria-pressed={mode === 'hit'} onClick={() => setMode('hit')}>
              hit {hit.target}</button>}
            {mine && mine.length > 0 && <button className="btn" aria-pressed={mode === 'mine'}
              onClick={() => setMode('mine')}>my boundaries</button>}
          </div>
          <Molstar uid={c.ecod_uid} residues={c.residues} ranges={ranges}
            caption={<>{c.domain_id}, the domain file the recommendations were computed on &middot; {n} residues</>} />
        </div>
        <div>
          <Options c={c} splitColors={splitColors} blind={blind} />
        </div>
      </div>

      <NearestRep c={c} />

      <h2>Evidence along the domain</h2>
      <Track c={c} splitColors={splitColors} onHit={(h) => { setHit(h); setMode('hit'); }} selected={hit} mine={mine} />

      {hit && (
        <>
          <h2>Manual rep {hit.target} <span className="muted" style={{ fontWeight: 400 }}>
            {hit.target_f} {hit.target_f_name}</span></h2>
          <div className="grid2">
            <Molstar uid={hit.target_uid} residues={[]} ranges={[]} height={320}
              caption={<>{hit.target}, whole domain ({hit.target_len} residues) &middot; matched query{' '}
                {pos(hit.qs)}–{pos(hit.qe)} at {hit.pid}% identity, {Math.round(hit.tcov * 100)}% of the rep</>} />
            <div className="muted" style={{ fontSize: 13 }}>
              {hit.src === 'struct'
                ? <>Foldseek: probability {hit.prob}, alignment TM-score {hit.tm}, E {hit.evalue.toExponential(1)}</>
                : <>MMseqs2: E {hit.evalue.toExponential(1)}, {hit.bits} bits</>}
              <div style={{ marginTop: 8 }}>
                <Link href={`/hgroup/${hit.target_h}`}>H-group {hit.target_h}</Link>
                {hit.target_h !== c.h_id && <span className="tag b-bad" style={{ marginLeft: 8 }}>
                  differs from the case&apos;s {c.h_id}</span>}
              </div>
            </div>
          </div>
        </>
      )}

      <h2>Hits to manual reps <span className="muted" style={{ fontWeight: 400 }}>
        (top {c.hits.length}; click a row to show it)</span></h2>
      <div className="scroll-x">
        <table>
          <thead><tr>
            <th>src</th><th>manual rep</th><th>H</th><th>F-group</th><th>query range</th>
            <th className="num">id%</th><th className="num">rep cov</th><th className="num">prob</th>
            <th className="num">TM</th><th className="num">bits</th>
          </tr></thead>
          <tbody>
            {c.hits.map((h, i) => (
              <tr key={i} onClick={() => { setHit(h); setMode('hit'); }} style={{
                cursor: 'pointer', background: hit === h ? 'var(--panel)' : undefined,
              }}>
                <td><span style={{ color: SRC[h.src] }}>{h.src}</span></td>
                <td className="mono">{h.target}</td>
                <td className="mono">{h.target_h}</td>
                <td className="mono" title={h.target_f_name}>{h.target_f}</td>
                <td className="mono">{blocksOf(h).map(([a, b]) => `${pos(a)}–${pos(b)}`).join(', ')}</td>
                <td className="num">{h.pid}</td>
                <td className="num">{h.tcov.toFixed(2)}</td>
                <td className="num">{h.prob ?? ''}</td>
                <td className="num">{h.tm ?? ''}</td>
                <td className="num">{h.bits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PieceRow({ p, color }: { p: Piece; color: string }) {
  const q = p.quality;
  return (
    <tr>
      <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: color }} /></td>
      <td className="mono">{p.range}</td>
      <td className="num">{p.length}</td>
      <td>{p.match
        ? <><span className="mono">{p.match.target}</span> <span className="muted">{p.match.target_h} &middot;{' '}
            {p.match.pid}% &middot; {p.match.src}</span></>
        : <span className="muted">{p.status === 'unassigned_domain' ? 'unassigned, folded' : 'linker / disorder'}</span>}
      </td>
      <td className="muted">{p.status === 'member_of_manual_rep' ? 'member' : p.status === 'rep' ? 'rep' : ''}</td>
      <td className="num">{q.mean_plddt ?? ''}</td>
      <td className="num">{q.lrc ?? ''}</td>
    </tr>
  );
}

function Options({ c, splitColors, blind }: { c: Case; splitColors: string[]; blind: boolean }) {
  const { split, trim, retire } = c.options;
  const demote = c.options.demote ?? null;
  const primary = blind ? null : c.recommendation.primary;
  const head = (k: string, ok: boolean | null, extra?: string) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6 }}>
      <span className={`tag r-${k}`} style={{ fontWeight: primary === k ? 700 : 400 }}>
        {primary === k ? '★ ' : ''}{blind && k !== 'retire' ? `${k} proposal` : blind ? 'quality' : k}</span>
      <span className="muted" style={{ fontSize: 12 }}>
        {ok === null ? 'none' : blind ? '' : ok ? 'viable' : 'not viable'}
        {extra ? `${blind || ok === null ? '' : ' · '}${extra}` : ''}</span>
    </div>
  );
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="panel" style={{ padding: 12 }}>
        {head('split', split ? split.viable : null, split ? `${split.n_domains} domain(s)` : undefined)}
        {split ? (
          <table style={{ fontSize: 13 }}>
            <thead><tr><th /><th>range</th><th className="num">len</th><th>matched rep</th><th>would be</th>
              <th className="num">pLDDT</th><th className="num">LRC</th></tr></thead>
            <tbody>{split.pieces.map((p, i) => <PieceRow key={i} p={p} color={splitColors[i]} />)}</tbody>
          </table>
        ) : <div className="muted">no segment matched a manual rep</div>}
      </div>

      <div className="panel" style={{ padding: 12 }}>
        {head('trim', trim ? trim.viable : null, trim ? `drops ${trim.dropped_residues} res (${Math.round(trim.dropped_frac * 100)}%)` : undefined)}
        {trim ? (
          <>
            <table style={{ fontSize: 13 }}>
              <tbody><PieceRow p={trim.piece} color={TRIM} /></tbody>
            </table>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {trim.piece.status === 'member_of_manual_rep'
                ? <>After trimming it is ≥50% identical over ≥80% of {trim.piece.match?.target}: a member, not a rep.</>
                : <>After trimming it stays a (provisional) rep with the new boundary.</>}
              {trim.dropped_ranges.length > 0 && <> Dropped: <span className="mono">{trim.dropped_ranges.join(', ')}</span>.</>}
              {trim.drops_folded_region && <span style={{ color: 'var(--bad)' }}> Drops a folded region.</span>}
              {trim.caution && <span style={{ color: 'var(--warn)' }}> Drops over 30% of the domain.</span>}
            </div>
          </>
        ) : <div className="muted">{c.segments.length
          ? 'the matched domain already spans the whole rep: no boundary to change' : 'no single segment to keep'}</div>}
      </div>

      <div className="panel" style={{ padding: 12 }}>
        {head('demote', demote ? true : null)}
        {demote ? (
          <div style={{ fontSize: 13 }}>
            The whole domain matches <span className="mono">{demote.match.target}</span>{' '}
            <span className="muted">({demote.match.target_h} &middot; {demote.match.target_f})</span> at{' '}
            {demote.match.pid}% identity over {Math.round(demote.match.tcov * 100)}% of it ({demote.match.src}):
            a member of that rep, with its boundaries unchanged.
          </div>
        ) : <div className="muted" style={{ fontSize: 13 }}>no manual rep matches the whole domain closely enough
          (≥50% identity over ≥80% of the rep)</div>}
      </div>

      <div className="panel" style={{ padding: 12 }}>
        {head('retire', retire.strong)}
        <div style={{ fontSize: 13 }}>
          {retire.reasons.length ? retire.reasons.join('; ') : <span className="muted">no quality concerns</span>}
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {retire.quality.mean_plddt !== undefined && <>mean pLDDT {retire.quality.mean_plddt}, {Math.round((retire.quality.frac_lt50 ?? 0) * 100)}% below 50 &middot; </>}
            {retire.quality.lrc !== null && <>{retire.quality.lrc} long-range contacts/residue (manual-rep 5th pct ≈ 1.0)</>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Track({ c, splitColors, onHit, selected, mine }: {
  c: Case; splitColors: string[]; onHit: (h: Hit) => void; selected: Hit | null; mine: ParsedDomain[] | null;
}) {
  const n = c.residues.length;
  const W = 1000;
  const x = (i: number) => ((i - 1) / n) * W;
  const w = (a: number, b: number) => Math.max(1.5, ((b - a + 1) / n) * W);
  const hits = c.hits.slice(0, 30);
  const ROW = 14;
  const rows: { label: string; y: number }[] = [];
  let y = 18;
  const next = (label: string) => { rows.push({ label, y }); const r = y; y += ROW + 4; return r; };
  const yPl = c.residues.some((r) => r[3] !== null) ? next('pLDDT') : null;
  const ySplit = c.options.split ? next('split') : null;
  const yTrim = c.options.trim ? next('trim') : null;
  const ySeg = next('tiled segs');
  const yMine = mine && mine.length ? next('mine') : null;
  y += 4;
  const yHits = hits.map((_, i) => next(i === 0 ? 'hits' : ''));
  const ticks = Array.from({ length: 6 }, (_, k) => Math.max(1, Math.round(1 + (k * (n - 1)) / 5)));

  return (
    <div className="scroll-x">
      <svg viewBox={`-90 0 ${W + 100} ${y + 4}`} style={{ width: '100%', minWidth: 640, fontSize: 11 }}
        role="img" aria-label="Domain evidence track">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={12} y2={y} stroke="var(--line)" />
            <text x={x(t)} y={9} textAnchor="middle" fill="var(--muted)">
              {c.residues[t - 1] ? `${c.residues[t - 1][0]}:${c.residues[t - 1][1]}` : t}</text>
          </g>
        ))}
        {rows.map((r) => r.label && (
          <text key={r.label} x={-8} y={r.y + 11} textAnchor="end" fill="var(--muted)">{r.label}</text>
        ))}
        {yPl !== null && c.residues.map((r, i) => (
          <rect key={i} x={x(i + 1)} y={yPl} width={W / n + 0.3} height={ROW} fill={plddtColor(r[3] ?? 0)} />
        ))}
        {ySplit !== null && c.options.split!.pieces.flatMap((p, i) => partsOf(p).map(([a, b], k) => (
          <rect key={`${i}-${k}`} x={x(a)} y={ySplit} width={w(a, b)} height={ROW} rx={2}
            fill={splitColors[i]}><title>{`${p.range} ${p.match ? p.match.target : p.status}`}</title></rect>
        )))}
        {yTrim !== null && (() => {
          const p = c.options.trim!.piece;
          return (
            <>
              <rect x={0} y={yTrim + 5} width={W} height={4} fill={DROPPED} opacity={0.5} />
              {partsOf(p).map(([a, b], k) => (
                <rect key={k} x={x(a)} y={yTrim} width={w(a, b)} height={ROW} rx={2} fill={TRIM}>
                  <title>{p.range}</title></rect>
              ))}
            </>
          );
        })()}
        {c.segments.map((s, i) => (
          <g key={i}>
            {s.blocks && <line x1={x(s.qs)} x2={x(s.qe)} y1={ySeg + ROW / 2} y2={ySeg + ROW / 2} stroke={SRC[s.src]} />}
            {blocksOf(s).map(([a, b], k) => (
              <rect key={k} x={x(a)} y={ySeg} width={w(a, b)} height={ROW} rx={2} fill={SRC[s.src]}
                stroke="var(--fg)" strokeWidth={0.5}><title>{`${s.target} (${s.target_h}) ${s.pid}%`}</title></rect>
            ))}
          </g>
        ))}
        {yMine !== null && mine!.flatMap((d, i) => d.segments.map((g, k) => (
          <rect key={`${i}-${k}`} x={x(g.start)} y={yMine} width={w(g.start, g.end)} height={ROW} rx={2}
            fill={PIECE[i % PIECE.length]}><title>{`domain ${i + 1}: ${d.range}`}</title></rect>
        )))}
        {hits.map((h, i) => (
          <g key={i} onClick={() => onHit(h)} style={{ cursor: 'pointer' }}>
            {h.blocks && <line x1={x(h.qs)} x2={x(h.qe)} y1={yHits[i] + (ROW - 4) / 2} y2={yHits[i] + (ROW - 4) / 2}
              stroke={SRC[h.src]} />}
            {blocksOf(h).map(([a, b], k) => (
              <rect key={k} x={x(a)} y={yHits[i]} width={w(a, b)} height={ROW - 4} rx={2} fill={SRC[h.src]}
                opacity={h.src === 'struct' ? 0.35 + 0.65 * (h.prob ?? 0) : 0.85}
                stroke={selected === h ? 'var(--fg)' : 'none'} strokeWidth={1.5} />
            ))}
            <text x={Math.min(x(h.qe) + 4, W - 2)} y={yHits[i] + 9} fill="var(--muted)" fontSize={10}
              textAnchor={x(h.qe) + 160 > W ? 'end' : 'start'}>
              {h.target} {h.target_h} {h.pid}%</text>
          </g>
        ))}
      </svg>
      <div className="muted" style={{ fontSize: 12 }}>
        <span style={{ color: SRC.struct }}>■</span> Foldseek (opacity = probability) &nbsp;
        <span style={{ color: SRC.seq }}>■</span> MMseqs2 &nbsp;
        <span style={{ color: UNASSIGNED }}>■</span> unassigned folded piece &nbsp;
        <span style={{ color: LINKER }}>■</span> linker / disorder &nbsp;
        <span style={{ color: DROPPED }}>━</span> dropped by trim &nbsp;
        <span style={{ color: SRC.struct }}>■─■</span> hit skipping an insertion
      </div>
    </div>
  );
}
