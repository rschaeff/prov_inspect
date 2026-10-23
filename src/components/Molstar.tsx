'use client';

import { useEffect, useRef, useState } from 'react';

/** A run of residues to colour, as 1-based positions in the domain file's residue order. */
export type ColorRange = { start: number; end: number; color: string };

/**
 * One ECOD domain file with residue ranges coloured over a dimmed cartoon.
 *
 * MOL* IS THE PREBUILT BUNDLE FROM /public, injected here, not an import (see
 * sync_molstar.sh). The scene is MolViewSpec, as in sfld_inspect: MVS selects
 * by auth_asym_id / auth_seq_id, which is the numbering the recommendations
 * are written in, so no frame translation happens between the TSV and the
 * picture. Positions are converted to (chain, auth_seq) runs through the
 * case's own residue list, splitting at chain breaks.
 */

type MolstarGlobal = {
  Viewer: {
    create: (el: HTMLElement, opts: Record<string, unknown>) => Promise<{
      dispose: () => void;
      loadMvsData: (data: string, format: 'mvsj') => Promise<unknown>;
    }>;
  };
};

const DIM = '#b8bec6';
let loading: Promise<void> | null = null;

function loadMolstar(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as unknown as { molstar?: MolstarGlobal };
  if (w.molstar) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((res, rej) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/molstar/molstar.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = '/molstar/molstar.js';
    s.onload = () => res();
    s.onerror = () => rej(new Error('could not load /molstar/molstar.js'));
    document.head.appendChild(s);
  });
  return loading;
}

/** auth_seq_id is an integer in MVS; an insertion code ("52A") selects its base number. */
const seqNum = (s: string) => parseInt(s, 10);

function selectors(residues: [string, string, ...unknown[]][], r: ColorRange) {
  const out: { auth_asym_id: string; beg_auth_seq_id: number; end_auth_seq_id: number }[] = [];
  for (let i = r.start - 1; i < Math.min(r.end, residues.length); i++) {
    const [chain, num] = residues[i];
    const last = out[out.length - 1];
    if (last && last.auth_asym_id === chain) last.end_auth_seq_id = seqNum(num);
    else out.push({ auth_asym_id: chain, beg_auth_seq_id: seqNum(num), end_auth_seq_id: seqNum(num) });
  }
  return out;
}

/** A second structure superposed on the first (e.g. a manual rep moved into the case's frame). */
export type Overlay = { uid: string; rotation: number[]; translation: number[]; color: string };

function scene(url: string, residues: [string, string, ...unknown[]][], ranges: ColorRange[],
  overlay?: Overlay | null, origin?: string) {
  const colors = [
    { kind: 'color', params: { color: DIM } },
    ...ranges.flatMap((r) => {
      const sel = selectors(residues, r);
      return sel.length ? [{ kind: 'color', params: { color: r.color, selector: sel } }] : [];
    }),
  ];
  const extra = overlay ? [{
    kind: 'download',
    params: { url: `${origin}/api/structure/${overlay.uid}` },
    children: [{
      kind: 'parse',
      params: { format: 'pdb' },
      children: [{
        kind: 'structure',
        params: { type: 'model' },
        children: [
          { kind: 'transform', params: { rotation: overlay.rotation, translation: overlay.translation } },
          {
            kind: 'component',
            params: { selector: 'polymer' },
            children: [{ kind: 'representation', params: { type: 'cartoon' }, children: [
              { kind: 'color', params: { color: overlay.color } },
              { kind: 'opacity', params: { opacity: 0.7 } },
            ] }],
          },
        ],
      }],
    }],
  }] : [];
  return {
    root: {
      kind: 'root',
      children: [...extra, {
        kind: 'download',
        params: { url },
        children: [{
          kind: 'parse',
          params: { format: 'pdb' },
          children: [{
            kind: 'structure',
            params: { type: 'model' },
            children: [{
              kind: 'component',
              params: { selector: 'polymer' },
              children: [{ kind: 'representation', params: { type: 'cartoon' }, children: colors }],
            }],
          }],
        }],
      }],
    },
    metadata: { version: '1', timestamp: new Date().toISOString() },
  };
}

export default function Molstar({
  uid, residues, ranges, height = 420, caption, overlay = null,
}: {
  uid: string;
  residues: [string, string, ...unknown[]][];
  ranges: ColorRange[];
  height?: number;
  caption?: React.ReactNode;
  overlay?: Overlay | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const key = `${uid}|${ranges.map((r) => `${r.start}-${r.end}${r.color}`).join(',')}|${overlay?.uid ?? ''}`;

  useEffect(() => {
    let dead = false;
    let viewer: { dispose: () => void } | null = null;
    setBusy(true);
    setErr(null);
    (async () => {
      try {
        await loadMolstar();
        if (dead || !box.current) return;
        const w = window as unknown as { molstar?: MolstarGlobal };
        if (!w.molstar) throw new Error('molstar global missing after load');
        const v = await w.molstar.Viewer.create(box.current, {
          layoutIsExpanded: false,
          layoutShowControls: false,
          layoutShowSequence: false,
          layoutShowLog: false,
          layoutShowLeftPanel: false,
          viewportShowExpand: true,
          viewportShowSelectionMode: false,
          viewportShowAnimation: false,
          viewportShowTrajectoryControls: false,
        });
        if (dead) { v.dispose(); return; }
        viewer = v;
        const url = `${window.location.origin}/api/structure/${uid}`;
        await v.loadMvsData(JSON.stringify(scene(url, residues, ranges, overlay, window.location.origin)), 'mvsj');
        if (!dead) setBusy(false);
      } catch (e) {
        if (!dead) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
      }
    })();
    return () => { dead = true; if (viewer) viewer.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div>
      <div ref={box} style={{
        position: 'relative', width: '100%', height,
        border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden', background: 'var(--panel)',
      }} />
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        {err ? <span style={{ color: 'var(--bad)' }}>viewer failed: {err}</span>
          : busy ? 'loading domain file from the af2_pdb store...' : caption}
      </div>
    </div>
  );
}
