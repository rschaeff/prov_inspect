import { query } from '@/lib/db';

/**
 * Pilot labels, in ecod_curation.prov_pilot_label: kept apart from the decision log
 * (reference_domain_actions) so they never count as decisions or show in the "decided" views.
 * Append-only; the latest row per (pilot, ecod_uid, curator) is that curator's label.
 * Only the labeling curator's own rows are ever shown, and no agent may read this table.
 */

export type LabelAction = 'split' | 'trim' | 'retire' | 'keep' | 'unsure';
export const LABEL_ACTIONS: LabelAction[] = ['split', 'trim', 'retire', 'keep', 'unsure'];

/** Where a split or trim label's ranges came from; 'own' is a boundary neither proposal found. */
export type BoundarySource = 'split_proposal' | 'trim_proposal' | 'own';

export type Label = {
  id: number; ecod_uid: number; action: LabelAction;
  boundary_source: BoundarySource | null; boundaries: string | null; becomes_member: boolean | null;
  confidence: number; notes: string | null;
  created_at: string;
};

const COLS = `id, ecod_uid, action, boundary_source, boundaries, becomes_member, confidence, notes, created_at`;

/** This curator's current label for every case they have labeled. */
export async function myLabels(pilot: string, curatorId: number): Promise<Map<number, Label>> {
  const r = await query<Label>(
    `SELECT DISTINCT ON (ecod_uid) ${COLS}
       FROM ecod_curation.prov_pilot_label
      WHERE pilot = $1 AND curator_id = $2
      ORDER BY ecod_uid, created_at DESC, id DESC`, [pilot, curatorId]);
  return new Map(r.rows.map((x) => [x.ecod_uid, x]));
}
