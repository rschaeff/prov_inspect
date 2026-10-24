'use client';

import { useMemo, useState } from 'react';
import CaseView from './CaseView';
import type { Case } from '@/lib/data';
import type { BoundarySource, Label, LabelAction } from '@/lib/pilot';
import { checkCount, parseBoundaries } from '@/lib/ranges';

const ACTIONS: { k: LabelAction; label: string; note: string }[] = [
  { k: 'split', label: 'split', note: 'two or more domains' },
  { k: 'trim', label: 'trim', note: 'one domain, new boundary' },
  { k: 'demote', label: 'demote', note: 'boundaries right, but it duplicates a manual rep' },
  { k: 'retire', label: 'retire', note: 'poor domain' },
  { k: 'keep', label: 'keep', note: 'boundaries are right' },
  { k: 'unsure', label: "can't tell", note: 'not enough to decide' },
];
const CONF = [{ v: 1, label: 'low' }, { v: 2, label: 'medium' }, { v: 3, label: 'high' }];

/**
 * The blind labeling view: the case evidence (no pipeline verdicts) plus the label form. Boundaries
 * can come from either proposal or be the curator's own, for a boundary neither proposal found; own
 * boundaries are checked and drawn on the structure while typing. In an A/B pilot (c.alt) the curator
 * switches between two proposal sets; a proposal source belongs to the set it was picked from.
 */
export default function PilotCase({ c: base, current, nextHref }: {
  c: Case; current: Label | null; nextHref: string | null;
}) {
  const [setIdx, setSetIdx] = useState(0);
  const c = useMemo(() => (base.alt ? { ...base, options: base.alt[setIdx].options } : base), [base, setIdx]);
  const setName = base.alt?.[setIdx].set ?? null;
  // which set a picked proposal came from (A/B pilots only); a saved proposal label reopens as its ranges
  const [srcSet, setSrcSet] = useState<string | null>(null);
  const reopenAsOwn = !!base.alt && !!current?.boundaries;
  const splitDomains = c.options.split?.pieces.filter((p) => p.status !== 'linker_or_disorder') ?? [];
  const hasSplit = splitDomains.length >= 2;
  const hasTrim = !!c.options.trim;

  const [action, setAction] = useState<LabelAction | null>(current?.action ?? null);
  const [source, setSource] = useState<BoundarySource | null>(reopenAsOwn ? 'own' : current?.boundary_source ?? null);
  const [own, setOwn] = useState(current?.boundary_source === 'own' || reopenAsOwn
    ? (current!.boundaries ?? '').replace(/; /g, '\n') : '');
  const [member, setMember] = useState(!!current?.becomes_member);
  const [memberOf, setMemberOf] = useState(current?.member_of ?? (base.alt ? '' : c.options.demote?.match.target ?? ''));
  const [conf, setConf] = useState<number | null>(current?.confidence ?? null);
  const [notes, setNotes] = useState(current?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saved, setSaved] = useState(!!current);

  const bounded = action === 'split' || action === 'trim';
  const parsed = useMemo(() => (bounded && source === 'own' && own.trim()
    ? parseBoundaries(own, c.residues) : null), [bounded, source, own, c.residues]);
  const ownErr = parsed && 'error' in parsed ? parsed.error
    : parsed && bounded ? checkCount(action as 'split' | 'trim', parsed.domains.length) : null;
  const mine = parsed && 'domains' in parsed ? parsed.domains : null;

  const pickAction = (k: LabelAction) => {
    setAction(k);
    setSaved(false);
    // a proposal only fits its own action; own boundaries carry over
    if (source === 'split_proposal' && k !== 'split') setSource(null);
    if (source === 'trim_proposal' && k !== 'trim') setSource(null);
  };
  const pickProposal = (s: BoundarySource) => { setSource(s); setSrcSet(setName); setSaved(false); };
  // a proposal picked in one set is not the other set's: switching sets drops it
  const proposalHere = (s: BoundarySource) => source === s && srcSet === setName;
  const editFrom = (ranges: string[]) => { setSource('own'); setOwn(ranges.join('\n')); setSaved(false); };

  const ready = action && conf && (!bounded || (source && (source === 'own' ? mine && !ownErr
    : !base.alt || srcSet === setName)))
    && (action !== 'demote' || memberOf.trim());

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/pilot/${c.ecod_uid}/label`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, boundary_source: bounded ? source : null, proposal_set: srcSet, boundaries: own,
        becomes_member: member, member_of: memberOf, confidence: conf, notes }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: j.error ?? r.statusText }); return; }
    setSaved(true);
    setMsg({ ok: true, text: 'saved' });
  };

  return (
    <>
      {base.alt && (
        <div className="panel" style={{ padding: 10, margin: '12px 0 0', display: 'flex', gap: 8, alignItems: 'center',
          flexWrap: 'wrap' }}>
          <b>Proposals</b>
          {base.alt.map((x, i) => (
            <button key={x.set} type="button" className="btn" aria-pressed={setIdx === i} onClick={() => setSetIdx(i)}>
              set {x.set}</button>
          ))}
          <span className="muted" style={{ fontSize: 13 }}>
            Two versions of the pipeline, in an order that differs case by case. They may agree. The evidence below is
            the same for both; only the split and trim proposals change.</span>
        </div>
      )}
      <div className="panel" style={{ padding: 14, margin: '12px 0 16px' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <b style={{ marginRight: 6 }}>Your call</b>
          {ACTIONS.map((a) => (
            <button key={a.k} type="button" className="btn" aria-pressed={action === a.k} title={a.note}
              onClick={() => pickAction(a.k)}>{a.label}</button>
          ))}
        </div>

        {bounded && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 13 }}>boundaries from</span>
              {action === 'split' && hasSplit && (
                <button type="button" className="btn" aria-pressed={proposalHere('split_proposal')}
                  onClick={() => pickProposal('split_proposal')}>the split proposal{setName ? ` (set ${setName})` : ''}</button>)}
              {action === 'trim' && hasTrim && (
                <button type="button" className="btn" aria-pressed={proposalHere('trim_proposal')}
                  onClick={() => pickProposal('trim_proposal')}>the trim proposal{setName ? ` (set ${setName})` : ''}</button>)}
              <button type="button" className="btn" aria-pressed={source === 'own'}
                onClick={() => { setSource('own'); setSaved(false); }}>my own</button>
            </div>
            {source === 'own' && (
              <div style={{ marginTop: 8 }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  One domain per line (or separate with <span className="mono">;</span>); segments of a discontinuous
                  domain joined by commas. Numbering as in the file: <span className="mono">
                  {c.residues[0]?.[0]}:{c.residues[0]?.[1]}</span> to <span className="mono">
                  {c.residues[c.residues.length - 1]?.[0]}:{c.residues[c.residues.length - 1]?.[1]}</span>.
                  {' '}Start from:{' '}
                  {hasSplit && <button type="button" className="linkish" onClick={() => editFrom(splitDomains.map((p) => p.range))}>
                    split proposal</button>}
                  {hasSplit && hasTrim && ' · '}
                  {hasTrim && <button type="button" className="linkish" onClick={() => editFrom([c.options.trim!.piece.range])}>
                    trim proposal</button>}
                </div>
                <textarea value={own} onChange={(e) => { setOwn(e.target.value); setSaved(false); }} rows={3}
                  className="mono" placeholder={action === 'split' ? 'A:1-120\nA:121-260' : 'A:15-140'}
                  style={{ width: '100%', padding: 6, background: 'var(--bg)', color: 'var(--fg)',
                    border: '1px solid var(--line)', borderRadius: 6, font: 'inherit' }} />
                <div style={{ fontSize: 12 }}>
                  {ownErr ? <span style={{ color: 'var(--bad)' }}>{ownErr}</span>
                    : mine ? <span className="muted">{mine.map((d, i) => `domain ${i + 1}: ${d.range} (${d.length} res)`).join(' · ')}
                      {' '}&middot; shown on the structure as &quot;my boundaries&quot;</span> : null}
                </div>
              </div>
            )}
            {action === 'trim' && (
              <label style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
                <input type="checkbox" checked={member} onChange={(e) => { setMember(e.target.checked); setSaved(false); }} />
                {' '}the trimmed domain is already represented: it should become a member of a manual rep, not a rep
              </label>
            )}
          </div>
        )}

        {action === 'demote' && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            <span className="muted">member of manual rep </span>
            <input className="mono" value={memberOf} size={16} placeholder="e.g. e1uvqB2"
              onChange={(e) => { setMemberOf(e.target.value); setSaved(false); }}
              style={{ background: 'var(--bg)', color: 'var(--fg)', border: '1px solid var(--line)', borderRadius: 6,
                padding: '3px 8px' }} />
            <span className="muted"> &middot; boundaries unchanged</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <span className="muted" style={{ fontSize: 13 }}>confidence</span>
          {CONF.map((x) => (
            <button key={x.v} type="button" className="btn" aria-pressed={conf === x.v}
              onClick={() => { setConf(x.v); setSaved(false); }}>{x.label}</button>
          ))}
        </div>
        <textarea value={notes} onChange={(e) => { setNotes(e.target.value); setSaved(false); }} rows={2}
          placeholder="notes (optional): what decided it, what you'd want to check"
          style={{ width: '100%', marginTop: 8, padding: 6, background: 'var(--bg)', color: 'var(--fg)',
            border: '1px solid var(--line)', borderRadius: 6, font: 'inherit' }} />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 6 }}>
          <button type="button" className="btn" onClick={save} disabled={!ready || busy || saved}>
            {busy ? 'saving...' : saved ? 'saved' : current ? 'save revised label' : 'save label'}</button>
          {msg && <span style={{ color: msg.ok ? 'var(--ok)' : 'var(--bad)', fontSize: 13 }}>{msg.text}</span>}
          {nextHref && <a href={nextHref} style={{ marginLeft: 'auto' }}>next unlabeled &rarr;</a>}
        </div>
      </div>
      <CaseView c={c} blind mine={mine} />
    </>
  );
}
