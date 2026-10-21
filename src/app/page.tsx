import Link from 'next/link';
import { getCensus, getIndex, RECS, REC_NOTE, type IndexRow } from '@/lib/data';
import { ACTION_LABEL, latestDecisions, recAction, type Action, type ActionRow } from '@/lib/actions';

const CLASSES = ['amalgam', 'partial', 'redundant', 'no_hit'];
const PAGE = 100;
const SORTS: Record<string, (a: IndexRow, b: IndexRow) => number> = {
  members: (a, b) => b.mem - a.mem,
  ratio: (a, b) => (b.ratio ?? 0) - (a.ratio ?? 0),
  plddt: (a, b) => (a.plddt ?? 999) - (b.plddt ?? 999),
  domains: (a, b) => b.nd - a.nd,
};

type SP = Record<string, string | undefined>;

export default async function Home({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [census, index] = await Promise.all([getCensus(), getIndex()]);
  // Decisions are live (they are ours, not ecod_commons); the list still works if dione is unreachable.
  let decided = new Map<string, ActionRow>();
  let decErr: string | null = null;
  try { decided = await latestDecisions(); } catch (e) { decErr = e instanceof Error ? e.message : String(e); }
  const dec = sp.dec ?? '';
  const rec = sp.rec ?? '';
  const cls = sp.cls ?? '';
  const h = sp.h ?? '';
  const type = sp.type ?? '';
  const tier = sp.tier ?? '';
  const qq = (sp.q ?? '').trim().toLowerCase();
  const sort = SORTS[sp.sort ?? ''] ? sp.sort! : 'members';
  const page = Math.max(0, parseInt(sp.page ?? '0', 10) || 0);

  const rows = index.filter((r) => (!rec || r.rec === rec) && (!cls || r.cls === cls) && (!h || r.h === h)
    && (!type || (type === 'model') === r.model) && (!tier || r.tier === tier)
    && (!qq || r.did.toLowerCase().includes(qq) || String(r.uid) === qq)
    && (!dec || (dec === 'decided') === decided.has(r.did))).sort(SORTS[sort]);
  const shown = rows.slice(page * PAGE, (page + 1) * PAGE);

  const cell = (c: string, k: string) => census.by_class_rec.find((x) => x.cls === c && x.rec === k)?.n ?? 0;
  const link = (over: SP) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ rec, cls, h, type, tier, dec, q: sp.q, sort, ...over })) if (v) p.set(k, v);
    return `/?${p}`;
  };

  return (
    <>
      <h1>Provisional reps in mixed H-groups</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {census.n_cases.toLocaleString()} provisional reps called amalgam, partial, redundant or no-hit against the
        manual reps, each with a split, trim and retire option and one primary recommendation. Divergent single
        domains (12,159) are not cases.
      </p>

      <div className="scroll-x">
        <table style={{ maxWidth: 760 }}>
          <thead><tr><th>call \ recommendation</th>
            {RECS.map((k) => <th key={k} className="num"><span className={`tag r-${k}`} title={REC_NOTE[k]}>{k}</span></th>)}
            <th className="num">total</th></tr></thead>
          <tbody>
            {CLASSES.map((c) => (
              <tr key={c}><td><Link href={link({ cls: c, rec: '', page: '' })}>{c}</Link></td>
                {RECS.map((k) => <td key={k} className="num">
                  <Link href={link({ cls: c, rec: k, page: '' })}>{cell(c, k).toLocaleString()}</Link></td>)}
                <td className="num">{RECS.reduce((s, k) => s + cell(c, k), 0).toLocaleString()}</td></tr>
            ))}
            <tr><td className="muted">ecod_commons members affected</td>
              {RECS.map((k) => <td key={k} className="num muted">{(census.members_by_rec[k] ?? 0).toLocaleString()}</td>)}
              <td /></tr>
          </tbody>
        </table>
      </div>

      <form className="filters" action="/">
        <select name="rec" defaultValue={rec}><option value="">any recommendation</option>
          {RECS.map((k) => <option key={k}>{k}</option>)}</select>
        <select name="cls" defaultValue={cls}><option value="">any call</option>
          {CLASSES.map((k) => <option key={k}>{k}</option>)}</select>
        <select name="tier" defaultValue={tier}><option value="">any amalgam tier</option>
          {['high', 'medium', 'low'].map((k) => <option key={k}>{k}</option>)}</select>
        <select name="type" defaultValue={type}><option value="">models + experimental</option>
          <option value="model">computed models</option><option value="exp">experimental</option></select>
        <select name="dec" defaultValue={dec}><option value="">decided + undecided</option>
          <option value="undecided">undecided</option><option value="decided">decided</option></select>
        <input name="h" placeholder="H-group, e.g. 109.4" defaultValue={h} size={14} />
        <input name="q" placeholder="domain id or uid" defaultValue={sp.q ?? ''} size={16} />
        <select name="sort" defaultValue={sort}>
          <option value="members">most members</option><option value="ratio">longest vs H median</option>
          <option value="domains">most split domains</option><option value="plddt">lowest pLDDT</option></select>
        <button className="btn" type="submit">filter</button>
        <span className="muted">{rows.length.toLocaleString()} cases &middot; {decided.size.toLocaleString()} decided overall</span>
        {decErr && <span style={{ color: 'var(--bad)' }}>decision log unavailable: {decErr}</span>}
      </form>

      <div className="scroll-x">
        <table>
          <thead><tr><th>domain</th><th>H</th><th>call</th><th>rec</th><th className="num">len</th>
            <th className="num">×median</th><th className="num">pLDDT</th><th className="num">members</th><th>decision</th><th>why</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.uid}>
                <td className="mono"><Link href={caseLink(r.uid, { rec, cls, h })}>{r.did}</Link></td>
                <td className="mono"><Link href={`/hgroup/${r.h}`}>{r.h}</Link></td>
                <td>{r.cls}{r.tier ? <span className="muted"> ({r.tier})</span> : null}</td>
                <td><span className={`tag r-${r.rec}`}>{r.rec}</span></td>
                <td className="num">{r.len}</td>
                <td className="num">{r.ratio?.toFixed(2) ?? ''}</td>
                <td className="num">{r.plddt ?? ''}</td>
                <td className="num">{r.mem ? r.mem.toLocaleString() : ''}</td>
                <td><Decision row={decided.get(r.did)} rec={r.rec} /></td>
                <td className="muted" style={{ fontSize: 12 }}>{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="filters">
        {page > 0 && <Link className="btn" href={link({ page: String(page - 1) })}>previous</Link>}
        {(page + 1) * PAGE < rows.length && <Link className="btn" href={link({ page: String(page + 1) })}>next</Link>}
        <span className="muted">page {page + 1} of {Math.max(1, Math.ceil(rows.length / PAGE))}</span>
      </div>
    </>
  );
}

function caseLink(uid: number, f: SP) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return `/case/${uid}${p.size ? `?${p}` : ''}`;
}

const DEC_CLS: Record<string, string> = { split: 'r-split', trim: 'r-trim', remove: 'r-retire', keep: 'r-keep' };

/** Latest decision; a mark when it overrides the recommendation. */
function Decision({ row, rec }: { row?: ActionRow; rec: string }) {
  if (!row) return null;
  const override = row.action !== recAction(rec);
  return (
    <span title={`${row.curator}: ${row.reason ?? ''}`} style={{ whiteSpace: 'nowrap' }}>
      <span className={`tag ${DEC_CLS[row.action] ?? ''}`}>{ACTION_LABEL[row.action as Action] ?? row.action}</span>
      {override && <span style={{ color: 'var(--warn)' }}> &ne; rec</span>}
    </span>
  );
}
