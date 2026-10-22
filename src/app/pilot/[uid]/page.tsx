import Link from 'next/link';
import { notFound } from 'next/navigation';
import PilotCase from '@/components/PilotCase';
import { getCurrentSession } from '@/lib/auth';
import { blindCase, getCase, getPilot, pilotOpen } from '@/lib/data';
import { myLabels, type Label } from '@/lib/pilot';

export const dynamic = 'force-dynamic';

/**
 * One pilot case, blind: the header leaves out the call, its tier and evidence label, the
 * recommendation and its reason. Length, numbering and member counts stay; they are facts about the
 * domain, not conclusions.
 */
export default async function PilotCasePage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const pilot = await getPilot();
  const item = pilot?.items.find((x) => String(x.uid) === uid);
  if (!pilot || !item) notFound();
  const full = await getCase(uid);
  if (!full) notFound();
  const c = blindCase(full);
  const session = await getCurrentSession();
  const labels = session ? await myLabels(pilot.pilot, session.curator.id).catch(() => new Map<number, Label>()) : new Map<number, Label>();
  const items = [...pilot.items].sort((a, b) => a.order - b.order);
  const after = [...items.slice(item.order), ...items.slice(0, item.order - 1)];
  const next = after.find((x) => !labels.has(x.uid));

  return (
    <>
      <div className="muted" style={{ fontSize: 12 }}>
        <Link href="/pilot">pilot</Link> / case {item.order} of {items.length}
      </div>
      <h1><span className="mono">{c.domain_id}</span></h1>
      <div className="muted" style={{ fontSize: 13 }}>
        uid {c.ecod_uid} &middot; {c.type} &middot; range <span className="mono">{c.range_definition}</span> &middot;{' '}
        {c.h_id} {c.h_name} &middot; F <span className="mono">{c.f_id}</span> {c.f_name} &middot; {c.length} res,{' '}
        {c.len_ratio}× the H-group&apos;s manual median ({c.h_manual_median_len}) &middot; ecod_commons:{' '}
        {c.members.active.toLocaleString()} active members ({c.members.full_length} full-length,{' '}
        {c.members.fragments} under 60% of its length)
      </div>
      {!pilotOpen(pilot) && <p><b>Labeling is closed.</b></p>}
      {!session ? <p><b>Log in (top right) to label.</b> The evidence view opens once you are logged in.</p>
        : <PilotCase c={c} current={labels.get(item.uid) ?? null} nextHref={next ? `/pilot/${next.uid}` : null} />}
    </>
  );
}
