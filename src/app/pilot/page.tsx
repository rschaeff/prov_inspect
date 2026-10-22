import Link from 'next/link';
import { getCurrentSession } from '@/lib/auth';
import { getIndex, getPilot, pilotOpen } from '@/lib/data';
import { myLabels, type Label } from '@/lib/pilot';

export const dynamic = 'force-dynamic';

/**
 * The pilot sample in its frozen presentation order. Shows only what a curator needs to work through
 * it: no call, stratum or recommendation, and only the logged-in curator's own labels.
 */
export default async function PilotPage() {
  const pilot = await getPilot();
  if (!pilot) return <p>No pilot sample in this snapshot.</p>;
  const open = pilotOpen(pilot);
  const [index, session] = await Promise.all([getIndex(), getCurrentSession()]);
  const did = new Map(index.map((r) => [r.uid, r]));
  let labels = new Map<number, Label>();
  let err: string | null = null;
  if (session) {
    try { labels = await myLabels(pilot.pilot, session.curator.id); } catch (e) { err = e instanceof Error ? e.message : String(e); }
  }
  const items = [...pilot.items].sort((a, b) => a.order - b.order);
  const done = items.filter((x) => labels.has(x.uid)).length;
  const firstTodo = items.find((x) => !labels.has(x.uid));

  return (
    <div style={{ maxWidth: 820 }}>
      <h1>Pilot labeling <span className="muted" style={{ fontWeight: 400 }}>{pilot.pilot}</span></h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {items.length} cases drawn {pilot.created} (seed {pilot.seed}), labeled blind before any agent sees them.
        The labeling view shows the evidence and both candidate boundary sets, but not the pipeline&apos;s
        recommendation. While labeling is open these cases are hidden from the rest of the app.
        {!open && <b> Labeling is closed.</b>}
      </p>
      {!session && <p><b>Log in (top right) to label.</b></p>}
      {err && <p style={{ color: 'var(--bad)' }}>labels unavailable: {err}</p>}
      {session && (
        <div className="filters">
          <span><b>{done}</b> of {items.length} labeled</span>
          {firstTodo && open && <Link className="btn" href={`/pilot/${firstTodo.uid}`}>
            {done ? 'continue' : 'start'} &rarr;</Link>}
        </div>
      )}
      <table>
        <thead><tr><th className="num">#</th><th>domain</th><th>type</th><th className="num">len</th>
          <th>your label</th></tr></thead>
        <tbody>
          {items.map((x) => {
            const r = did.get(x.uid);
            const l = labels.get(x.uid);
            return (
              <tr key={x.uid}>
                <td className="num muted">{x.order}</td>
                <td className="mono"><Link href={`/pilot/${x.uid}`}>{r?.did ?? x.uid}</Link></td>
                <td className="muted">{r ? (r.model ? 'model' : 'experimental') : ''}</td>
                <td className="num">{r?.len ?? ''}</td>
                <td>{l && <>{l.action === 'unsure' ? "can't tell" : l.action}
                  {l.boundary_source === 'own' && <span className="muted"> (own boundaries)</span>}
                  {l.member_of && <span className="muted"> to {l.member_of}</span>}
                  <span className="muted"> &middot; {['', 'low', 'medium', 'high'][l.confidence]}</span></>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
