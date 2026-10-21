import { query } from '@/lib/db';
import { getCensus, type Case, type Piece } from '@/lib/data';

/**
 * Curator decisions, logged to ecod_curation.reference_domain_actions: the
 * table pyecod_vis defined for reference-domain actions (same DDL, so its
 * history view shows these rows too). Where the vocabularies overlap we use
 * pyecod_vis's words: retiring a rep is its 'remove', and 'flag_review' is
 * shared. 'split', 'trim' and 'keep' are new.
 *
 * The proposal recorded with a decision is rebuilt on the server from the
 * case snapshot, never taken from the browser, so a row always says exactly
 * which boundaries were accepted. Rows from this app carry
 * new_classification.source = 'prov_inspect'.
 */

export type Action = 'split' | 'trim' | 'remove' | 'keep' | 'flag_review';
export const ACTIONS: Action[] = ['split', 'trim', 'remove', 'keep', 'flag_review'];
export const ACTION_LABEL: Record<Action, string> = {
  split: 'accept split',
  trim: 'accept trim',
  remove: 'retire',
  keep: 'keep as is',
  flag_review: 'flag for review',
};

/** The pipeline's recommendation, in the log's vocabulary. */
export const recAction = (rec: string): Action => (rec === 'retire' ? 'remove' : rec as Action);

export type ActionRow = {
  id: number; ecod_domain_id: string; action: string; reason: string | null; curator: string;
  created_at: string; new_classification: Record<string, unknown> | null;
};

const piece = (p: Piece) => ({
  range: p.range, status: p.status, length: p.length,
  target: p.match?.target ?? null, target_f: p.match?.target_f ?? null,
});

export async function buildRow(c: Case, action: Action) {
  const census = await getCensus();
  const old = {
    t_group: c.t_id, f_group: c.f_id, range_definition: c.range_definition, ecod_uid: c.ecod_uid,
    call: c.call.cls, members_active: c.members.active,
  };
  let proposal: Record<string, unknown> | null = null;
  if (action === 'split') proposal = { pieces: c.options.split!.pieces.map(piece) };
  if (action === 'trim') proposal = { piece: piece(c.options.trim!.piece), dropped: c.options.trim!.dropped_ranges };
  if (action === 'remove') proposal = { reasons: c.options.retire.reasons };
  const neu = {
    source: 'prov_inspect',
    snapshot: census.built,
    recommended: recAction(c.recommendation.primary),
    // computed models are numbered by UniProt seqid; experimental domains by PDB author numbering
    numbering: c.type === 'experimental structure' ? 'pdb_author' : 'seqid',
    ...proposal,
  };
  return { old, neu };
}

/** Is this action possible for the case? Mirrors which options the case page offers. */
export function available(c: Case, action: Action): boolean {
  if (action === 'split') return !!c.options.split && c.options.split.pieces.length > 1;
  if (action === 'trim') return !!c.options.trim;
  return true;
}

export async function history(domainId: string): Promise<ActionRow[]> {
  const r = await query<ActionRow>(
    `SELECT id, ecod_domain_id, action, reason, curator, created_at, new_classification
       FROM ecod_curation.reference_domain_actions
      WHERE ecod_domain_id = $1
      ORDER BY created_at DESC, id DESC`, [domainId]);
  return r.rows;
}

/** Latest prov_inspect decision per domain, for the case list. */
export async function latestDecisions(): Promise<Map<string, ActionRow>> {
  const r = await query<ActionRow>(
    `SELECT DISTINCT ON (ecod_domain_id) id, ecod_domain_id, action, reason, curator, created_at, new_classification
       FROM ecod_curation.reference_domain_actions
      WHERE new_classification->>'source' = 'prov_inspect'
      ORDER BY ecod_domain_id, created_at DESC, id DESC`);
  return new Map(r.rows.map((x) => [x.ecod_domain_id, x]));
}
