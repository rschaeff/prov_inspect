import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { getCase, getPilot, pilotOpen } from '@/lib/data';
import { query } from '@/lib/db';
import { LABEL_ACTIONS, type BoundarySource, type LabelAction } from '@/lib/pilot';
import { checkCount, parseBoundaries } from '@/lib/ranges';

/**
 * POST a pilot label: {action, boundary_source?, boundaries?, becomes_member?, member_of?, confidence, notes?}.
 * A demote names the manual rep to join: member_of, defaulting to the demote proposal's.
 * Split and trim labels always store their resolved ranges: a proposal's are read from the snapshot
 * case file (never sent by the browser), the curator's own are checked against the domain file.
 */
export async function POST(req: Request, ctx: { params: Promise<{ uid: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'log in first' }, { status: 401 });
  const pilot = await getPilot();
  if (!pilotOpen(pilot)) return NextResponse.json({ error: 'the pilot is closed' }, { status: 409 });
  const { uid } = await ctx.params;
  if (!pilot!.items.some((x) => String(x.uid) === uid)) {
    return NextResponse.json({ error: 'not a pilot case' }, { status: 404 });
  }
  const c = await getCase(uid);
  if (!c) return NextResponse.json({ error: 'no such case' }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const action = b.action as LabelAction;
  if (!LABEL_ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action must be one of ${LABEL_ACTIONS.join(', ')}` }, { status: 400 });
  }
  const confidence = Number(b.confidence);
  if (![1, 2, 3].includes(confidence)) return NextResponse.json({ error: 'confidence must be 1, 2 or 3' }, { status: 400 });

  let source: BoundarySource | null = null;
  let boundaries: string | null = null;
  if (action === 'split' || action === 'trim') {
    source = b.boundary_source;
    if (source === 'split_proposal' && action === 'split' && c.options.split) {
      const doms = c.options.split.pieces.filter((p) => p.status !== 'linker_or_disorder');
      if (doms.length < 2) return NextResponse.json({ error: 'the split proposal has fewer than two domains' }, { status: 400 });
      boundaries = doms.map((p) => p.range).join('; ');
    } else if (source === 'trim_proposal' && action === 'trim' && c.options.trim) {
      boundaries = c.options.trim.piece.range;
    } else if (source === 'own') {
      const parsed = parseBoundaries(String(b.boundaries ?? ''), c.residues);
      if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
      const err = checkCount(action, parsed.domains.length);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      boundaries = parsed.domains.map((d) => d.range).join('; ');
    } else if (source === 'split_proposal' || source === 'trim_proposal') {
      const want = source === 'split_proposal' ? 'split' : 'trim';
      return NextResponse.json({ error: want !== action ? `the ${want} proposal can't be used for a ${action}`
        : `this case has no ${want} proposal; give your own boundaries` }, { status: 400 });
    } else {
      return NextResponse.json({ error: `choose where the ${action}'s boundaries come from` }, { status: 400 });
    }
  }
  const becomesMember = action === 'trim' ? !!b.becomes_member : null;
  let memberOf: string | null = null;
  if (action === 'demote') {
    memberOf = (typeof b.member_of === 'string' && b.member_of.trim()) || c.options.demote?.match.target || null;
    if (!memberOf) return NextResponse.json({ error: 'name the manual rep it duplicates' }, { status: 400 });
    if (!/^[A-Za-z0-9_.]{4,30}$/.test(memberOf)) return NextResponse.json({ error: 'not a domain id' }, { status: 400 });
  }
  const notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim() : null;

  try {
    const r = await query(
      `INSERT INTO ecod_curation.prov_pilot_label
         (pilot, ecod_uid, ecod_domain_id, action, boundary_source, boundaries, becomes_member, member_of,
          confidence, notes, curator, curator_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, created_at`,
      [pilot!.pilot, parseInt(uid, 10), c.domain_id, action, source, boundaries, becomesMember, memberOf, confidence, notes,
        session.curator.username, session.curator.id]);
    return NextResponse.json({ success: true, id: r.rows[0].id, boundaries });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
