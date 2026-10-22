'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Action, ActionRow } from '@/lib/actions';
import { checkCount, parseBoundaries, type ParsedDomain, type Residue } from '@/lib/ranges';

const LABEL: Record<Action, string> = {
  split: 'split', trim: 'trim', demote: 'demote to member', remove: 'retire', keep: 'keep as is', flag_review: 'flag for review',
};
const CLS: Record<string, string> = {
  split: 'r-split', trim: 'r-trim', demote: 'r-demote', remove: 'r-retire', keep: 'r-keep',
};

/**
 * Log a decision on this case to ecod_curation.reference_domain_actions and
 * show the domain's action history (rows from pyecod_vis included). A split or
 * trim takes the pipeline's proposal or the curator's own boundaries, for a
 * boundary neither proposal found; own boundaries are drawn on the structure
 * (onMine) while typing. Accepting the recommendation as proposed needs no
 * reason; anything else does.
 */
export default function DecisionPanel({ uid, recommended, nextHref, residues, proposals, onMine }: {
  uid: string; recommended: Action; nextHref: string; residues: Residue[];
  proposals: { split: string[] | null; trim: string | null; demote: string | null };
  onMine: (d: ParsedDomain[] | null) => void;
}) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<ActionRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pick, setPick] = useState<Action>(recommended);
  const [useOwn, setUseOwn] = useState(false);
  const [own, setOwn] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    fetch(`/api/case/${uid}/action`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      setRows(j.actions);
    }).catch((e) => setLoadErr(String(e.message ?? e)));
  }, [uid]);

  useEffect(() => {
    load();
    fetch('/api/auth/me').then((r) => setAuthed(r.ok)).catch(() => setAuthed(false));
  }, [load]);

  const bounded = pick === 'split' || pick === 'trim';
  const proposal = pick === 'split' ? proposals.split : pick === 'trim' && proposals.trim ? [proposals.trim] : null;
  const owning = bounded && (useOwn || !proposal);
  const parsed = useMemo(() => (owning && own.trim() ? parseBoundaries(own, residues) : null), [owning, own, residues]);
  const ownErr = parsed && 'error' in parsed ? parsed.error
    : parsed ? checkCount(pick as 'split' | 'trim', parsed.domains.length) : null;
  const mine = owning && parsed && 'domains' in parsed && !ownErr ? parsed.domains : null;
  const mineKey = mine?.map((d) => d.range).join(';') ?? '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onMine(mine), [mineKey]);

  const needsReason = pick !== recommended || pick === 'flag_review' || owning;
  const ready = (!owning || mine) && (!needsReason || reason.trim());

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/case/${uid}/action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: pick, reason, boundary_source: owning ? 'own' : undefined, boundaries: own }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: j.error ?? r.statusText }); return; }
    setMsg({ ok: true, text: `logged as #${j.id}` });
    setReason('');
    load();
  };

  return (
    <div className="panel" style={{ padding: 14, margin: '16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <b>Decision</b>
        <span className="muted" style={{ fontSize: 12 }}>logged to ecod_curation.reference_domain_actions</span>
        <a href={nextHref} className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>next undecided &rarr;</a>
      </div>

      {authed === false && <div className="muted" style={{ marginTop: 8 }}>Log in (top right) to record a decision.</div>}
      {authed && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['split', 'trim', 'demote', 'remove', 'keep', 'flag_review'] as Action[])
              .filter((a) => a !== 'demote' || proposals.demote).map((a) => (
              <button key={a} type="button" onClick={() => setPick(a)} className="btn" aria-pressed={pick === a}>
                {a === recommended ? '★ ' : ''}{LABEL[a]}
              </button>
            ))}
          </div>
          {pick === 'demote' && (
            <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              becomes a member of <span className="mono">{proposals.demote}</span>; boundaries unchanged</div>
          )}
          {bounded && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="muted" style={{ fontSize: 13 }}>boundaries from</span>
                {proposal && <button type="button" className="btn" aria-pressed={!useOwn}
                  onClick={() => setUseOwn(false)}>the {pick} proposal</button>}
                <button type="button" className="btn" aria-pressed={owning} onClick={() => setUseOwn(true)}>my own</button>
                {proposal && !owning && <span className="mono muted" style={{ fontSize: 12 }}>{proposal.join('; ')}</span>}
              </div>
              {owning && (
                <>
                  <div className="muted" style={{ fontSize: 12, margin: '6px 0 4px' }}>
                    One domain per line (or <span className="mono">;</span>), segments joined by commas; numbering as in
                    the file ({residues[0]?.[0]}:{residues[0]?.[1]} to {residues[residues.length - 1]?.[0]}:
                    {residues[residues.length - 1]?.[1]}).
                    {proposal && <> <button type="button" className="linkish" onClick={() => setOwn(proposal.join('\n'))}>
                      start from the proposal</button></>}
                  </div>
                  <textarea value={own} onChange={(e) => setOwn(e.target.value)} rows={3} className="mono"
                    placeholder={pick === 'split' ? 'A:1-120\nA:121-260' : 'A:15-140'}
                    style={{ width: '100%', padding: 6, background: 'var(--bg)', color: 'var(--fg)',
                      border: '1px solid var(--line)', borderRadius: 6, font: 'inherit' }} />
                  <div style={{ fontSize: 12 }}>
                    {ownErr ? <span style={{ color: 'var(--bad)' }}>{ownErr}</span>
                      : mine ? <span className="muted">{mine.map((d, i) => `domain ${i + 1}: ${d.range} (${d.length} res)`)
                        .join(' · ')} &middot; shown on the structure as &quot;my boundaries&quot;</span> : null}
                  </div>
                </>
              )}
            </div>
          )}
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder={needsReason ? 'reason (required: this is not the recommendation as proposed)' : 'reason (optional)'}
            style={{ width: '100%', marginTop: 8, font: 'inherit', padding: 6, background: 'var(--bg)', color: 'var(--fg)',
              border: '1px solid var(--line)', borderRadius: 6 }} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
            <button className="btn" type="button" onClick={submit} disabled={busy || !ready}>
              {busy ? 'logging...' : `log: ${LABEL[pick]}${owning ? ' (own boundaries)' : ''}`}
            </button>
            {msg && <span style={{ color: msg.ok ? 'var(--ok)' : 'var(--bad)', fontSize: 13 }}>{msg.text}</span>}
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 13 }}>
        {loadErr && <span style={{ color: 'var(--bad)' }}>history unavailable: {loadErr}</span>}
        {rows && rows.length === 0 && <span className="muted">No decisions logged for this domain yet.</span>}
        {rows && rows.length > 0 && (
          <table>
            <thead><tr><th>when</th><th>curator</th><th>action</th><th>reason</th><th>tool</th></tr></thead>
            <tbody>
              {rows.map((x, i) => {
                const nc = x.new_classification ?? {};
                const doms = nc.boundary_source === 'own' ? (nc.domains as { range: string }[]) : null;
                return (
                  <tr key={x.id} style={i > 0 ? { opacity: 0.6 } : undefined}>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>{new Date(x.created_at).toLocaleString()}</td>
                    <td>{x.curator}</td>
                    <td><span className={`tag ${CLS[x.action] ?? ''}`}>{LABEL[x.action as Action] ?? x.action}</span>
                      {doms && <div className="mono muted" style={{ fontSize: 11 }}>{doms.map((d) => d.range).join('; ')}</div>}</td>
                    <td>{x.reason}</td>
                    <td className="muted">{(nc.source as string) ?? 'pyecod_vis'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
