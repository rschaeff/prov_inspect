import { query } from '@/lib/db';
import { getCensus, type Case, type Piece } from '@/lib/data';
import type { ParsedDomain } from '@/lib/ranges';

/**
 * Curator decisions, logged to ecod_curation.reference_domain_actions: the
 * table pyecod_vis defined for reference-domain actions (same DDL, so its
 * history view shows these rows too). Where the vocabularies overlap we use
 * pyecod_vis's words: retiring a rep is its 'remove', and 'flag_review' is
 * shared. 'split', 'trim' and 'keep' are new.
 *
 * The proposal recorded with a decision is rebuilt on the server from the
 * case snapshot, never taken from the browser, so a row always says exactly
 * which boundaries were accepted. A split or trim may instead carry the
 * curator's own boundaries (a boundary neither proposal found), checked
 * against the domain file; new_classification.boundary_source says which.
 * Rows from this app carry new_classification.source = 'prov_inspect'.
 */

export type Action = 'split' | 'trim' | 'demote' | 'remove' | 'keep' | 'flag_review';
export const ACTIONS: Action[] = ['split', 'trim', 'demote', 'remove', 'keep', 'flag_review'];
export const ACTION_LABEL: Record<Action, string> = {
  split: 'split',
  trim: 'trim',
  demote: 'demote to member',
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

export async function buildRow(c: Case, action: Action, own: ParsedDomain[] | null = null) {
  const census = await getCensus();
  const old = {
    t_group: c.t_id, f_group: c.f_id, range_definition: c.range_definition, ecod_uid: c.ecod_uid,
    call: c.call.cls, members_active: c.members.active,
  };
  let proposal: Record<string, unknown> | null = null;
  if (own) proposal = { boundary_source: 'own', domains: own.map((d) => ({ range: d.range, length: d.length })) };
  else if (action === 'split') proposal = { boundary_source: 'split_proposal', pieces: c.options.split!.pieces.map(piece) };
  else if (action === 'trim') {
    proposal = { boundary_source: 'trim_proposal', piece: piece(c.options.trim!.piece), dropped: c.options.trim!.dropped_ranges };
  }
  if (action === 'demote') {
    const m = c.options.demote!.match;
    proposal = { member_of: m.target, member_of_uid: m.target_uid, member_of_f: m.target_f, pid: m.pid, tcov: m.tcov };
  }
  if (action === 'remove') proposal = { reasons: c.options.retire.reasons };
  const neu = {
    source: 'prov_inspect',
    snapshot: census.snapshot ?? census.built,
    // which pipeline version made the recommendation this decision was made on
    pipeline: census.pipeline ?? null,
    recommended: recAction(c.recommendation.primary),
    // computed models are numbered by UniProt seqid; experimental domains by PDB author numbering
    numbering: c.type === 'experimental structure' ? 'pdb_author' : 'seqid',
    ...proposal,
  };
  return { old, neu };
}

/** Can this action use the pipeline's proposal? (Split and trim are always possible with own boundaries.) */
export function hasProposal(c: Case, action: Action): boolean {
  if (action === 'split') return !!c.options.split && c.options.split.pieces.length > 1;
  if (action === 'trim') return !!c.options.trim;
  if (action === 'demote') return !!c.options.demote;
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
