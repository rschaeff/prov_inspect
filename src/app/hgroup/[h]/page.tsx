import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCensus, getIndex, hiddenUids, RECS } from '@/lib/data';

export default async function HGroupPage({ params }: { params: Promise<{ h: string }> }) {
  const { h } = await params;
  const [census, index, hidden] = await Promise.all([getCensus(), getIndex(), hiddenUids()]);
  const g = census.hgroups.find((x) => x.h === h);
  if (!g) notFound();
  const rows = index.filter((r) => r.h === h && !hidden.has(r.uid))
    .sort((a, b) => RECS.indexOf(a.rec) - RECS.indexOf(b.rec) || b.mem - a.mem);
  return (
    <>
      <div className="muted" style={{ fontSize: 12 }}><Link href="/">cases</Link></div>
      <h1><span className="mono">{h}</span> {g.name}</h1>
      <div className="filters">
        {RECS.map((k) => <Link key={k} href={`/?h=${h}&rec=${k}`}><span className={`tag r-${k}`}>{k} {g[k]}</span></Link>)}
        <span className="muted">{g.members.toLocaleString()} ecod_commons members on these reps</span>
      </div>
      <table>
        <thead><tr><th>domain</th><th>call</th><th>rec</th><th className="num">len</th><th className="num">×median</th>
          <th className="num">members</th><th>why</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.uid}>
            <td className="mono"><Link href={`/case/${r.uid}`}>{r.did}</Link></td>
            <td>{r.cls}{r.tier ? <span className="muted"> ({r.tier})</span> : null}</td>
            <td><span className={`tag r-${r.rec}`}>{r.rec}</span></td>
            <td className="num">{r.len}</td><td className="num">{r.ratio?.toFixed(2) ?? ''}</td>
            <td className="num">{r.mem || ''}</td>
            <td className="muted" style={{ fontSize: 12 }}>{r.why}</td>
          </tr>))}
        </tbody>
      </table>
    </>
  );
}
