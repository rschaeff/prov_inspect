'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Action, ActionRow } from '@/lib/actions';

const LABEL: Record<Action, string> = {
  split: 'accept split', trim: 'accept trim', remove: 'retire', keep: 'keep as is', flag_review: 'flag for review',
};
const CLS: Record<string, string> = { split: 'r-split', trim: 'r-trim', remove: 'r-retire', keep: 'r-keep' };

/**
 * Log a decision on this case to ecod_curation.reference_domain_actions and
 * show the domain's action history (rows from pyecod_vis included). The
 * recommended action needs no reason; anything else does.
 */
export default function DecisionPanel({ uid, offered, recommended, nextHref }: {
  uid: string; offered: Action[]; recommended: Action; nextHref: string;
}) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<ActionRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pick, setPick] = useState<Action>(recommended);
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

  const needsReason = pick !== recommended || pick === 'flag_review';

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/case/${uid}/action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: pick, reason }),
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
            {offered.map((a) => (
              <button key={a} type="button" onClick={() => setPick(a)} className="btn" aria-pressed={pick === a}>
                {a === recommended ? '★ ' : ''}{LABEL[a]}
              </button>
            ))}
          </div>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder={needsReason ? 'reason (required: this is not the recommendation)' : 'reason (optional)'}
            style={{ width: '100%', marginTop: 8, font: 'inherit', padding: 6, background: 'var(--bg)', color: 'var(--fg)',
              border: '1px solid var(--line)', borderRadius: 6 }} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
            <button className="btn" type="button" onClick={submit} disabled={busy || (needsReason && !reason.trim())}>
              {busy ? 'logging...' : `log: ${LABEL[pick]}`}
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
              {rows.map((x, i) => (
                <tr key={x.id} style={i > 0 ? { opacity: 0.6 } : undefined}>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{new Date(x.created_at).toLocaleString()}</td>
                  <td>{x.curator}</td>
                  <td><span className={`tag ${CLS[x.action] ?? ''}`}>{LABEL[x.action as Action] ?? x.action}</span></td>
                  <td>{x.reason}</td>
                  <td className="muted">{(x.new_classification?.source as string) ?? 'pyecod_vis'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
