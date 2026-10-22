import { getIndex, hiddenUids } from '@/lib/data';
import { latestDecisions } from '@/lib/actions';

/**
 * GET /next?after=<uid>&rec=&cls=&h= -> redirect to the next case with no
 * prov_inspect decision, in the list's default order (most members first),
 * so a curator can work a queue without going back to the list.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const after = p.get('after') ?? '';
  const [index, decided, hidden] = await Promise.all([getIndex(), latestDecisions(), hiddenUids()]);
  const rows = index
    .filter((r) => (!p.get('rec') || r.rec === p.get('rec')) && (!p.get('cls') || r.cls === p.get('cls'))
      && (!p.get('h') || r.h === p.get('h')))
    .sort((a, b) => b.mem - a.mem);
  const at = rows.findIndex((r) => String(r.uid) === after);
  const next = [...rows.slice(at + 1), ...rows.slice(0, at + 1)]
    .find((r) => String(r.uid) !== after && !decided.has(r.did) && !hidden.has(r.uid));
  // Relative Location: req.url carries the bind address (0.0.0.0), not the host the browser used.
  const keep = new URLSearchParams([...p].filter(([k]) => k !== 'after'));
  const to = next ? `/case/${next.uid}${keep.size ? `?${keep}` : ''}` : '/?dec=undecided';
  return new Response(null, { status: 307, headers: { Location: to } });
}
