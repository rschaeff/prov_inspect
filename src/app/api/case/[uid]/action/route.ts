import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { getCase } from '@/lib/data';
import { query } from '@/lib/db';
import { ACTIONS, available, buildRow, history, recAction, type Action } from '@/lib/actions';

/**
 * GET  -> every logged action on this case's domain (from any tool, pyecod_vis included).
 * POST {action, reason} -> log a curator decision. The proposal stored with it
 * comes from the snapshot case file, not from the request body. A reason is
 * required unless the curator is accepting the pipeline's recommendation.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ uid: string }> }) {
  const c = await getCase((await ctx.params).uid);
  if (!c) return NextResponse.json({ error: 'no such case' }, { status: 404 });
  try {
    return NextResponse.json({ ecod_domain_id: c.domain_id, actions: await history(c.domain_id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ uid: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'log in first' }, { status: 401 });
  const c = await getCase((await ctx.params).uid);
  if (!c) return NextResponse.json({ error: 'no such case' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as Action;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: `action must be one of ${ACTIONS.join(', ')}` }, { status: 400 });
  }
  if (!available(c, action)) {
    return NextResponse.json({ error: `this case has no ${action} proposal` }, { status: 400 });
  }
  const accepted = action === recAction(c.recommendation.primary) && action !== 'flag_review';
  let reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason && !accepted) {
    return NextResponse.json({ error: 'a reason is required when overriding the recommendation' }, { status: 400 });
  }
  if (!reason) reason = 'accepted pipeline recommendation';

  try {
    const { old, neu } = await buildRow(c, action);
    const r = await query(
      `INSERT INTO ecod_curation.reference_domain_actions
         (ecod_domain_id, action, old_classification, new_classification, reason, curator, curator_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [c.domain_id, action, JSON.stringify(old), JSON.stringify(neu), reason,
        session.curator.username, session.curator.id]);
    return NextResponse.json({ success: true, id: r.rows[0].id, created_at: r.rows[0].created_at });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
