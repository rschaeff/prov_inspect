import Link from 'next/link';
import { notFound } from 'next/navigation';
import CaseView from '@/components/CaseView';
import DecisionPanel from '@/components/DecisionPanel';
import { ACTIONS, available, recAction } from '@/lib/actions';
import { getCase, REC_NOTE } from '@/lib/data';

export default async function CasePage({ params, searchParams }: {
  params: Promise<{ uid: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { uid } = await params;
  const sp = await searchParams;
  const c = await getCase(uid);
  if (!c) notFound();
  const r = c.recommendation;
  return (
    <>
      <div className="muted" style={{ fontSize: 12 }}>
        <Link href="/">cases</Link> / <Link href={`/hgroup/${c.h_id}`}>{c.h_id} {c.h_name}</Link>
      </div>
      <h1><span className="mono">{c.domain_id}</span>{' '}
        <span className={`tag r-${r.primary}`} title={REC_NOTE[r.primary]}>{r.primary}</span></h1>
      <div style={{ marginBottom: 4 }}>{r.why}</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
        uid {c.ecod_uid} &middot; {c.type} &middot; range <span className="mono">{c.range_definition}</span> &middot;{' '}
        F <span className="mono">{c.f_id}</span> {c.f_name} &middot; {c.length} res, {c.len_ratio}× the H-group&apos;s
        manual median ({c.h_manual_median_len}) &middot; call: {c.call.cls}
        {c.call.subclass ? ` / ${c.call.subclass}` : ''}{c.call.tier ? ` (${c.call.tier})` : ''} by {c.call.evidence}
        <br />
        ecod_commons: <b>{c.members.active.toLocaleString()}</b> active members use this rep
        {c.members.active > 0 && <> ({c.members.full_length} full-length, {c.members.fragments} under 60% of its length)
          {r.primary !== 'keep' && <span style={{ color: 'var(--warn)' }}> &mdash; reassign or re-parse after this change</span>}</>}
      </div>
      <DecisionPanel uid={uid} offered={ACTIONS.filter((a) => available(c, a))}
        recommended={recAction(r.primary)} nextHref={nextHref(c.ecod_uid, sp)} />
      <CaseView c={c} />
    </>
  );
}

/** Keep the list's rec/cls/h filter when moving through the queue (the list links carry it). */
function nextHref(uid: string, sp: Record<string, string | undefined>) {
  const p = new URLSearchParams({ after: uid });
  for (const k of ['rec', 'cls', 'h']) if (sp[k]) p.set(k, sp[k]!);
  return `/next?${p}`;
}
