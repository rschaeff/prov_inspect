import type { Case, Hit } from '@/lib/data';

/**
 * The manual reps closest to a case, for judging demote: is the whole domain already represented?
 * Hits are grouped by manual rep (a rep can have a sequence and a structure hit); a rep is a
 * candidate when its alignment covers at least half of the case and half of the rep, and candidates
 * rank by identity, then TM-score. Reps covering less follow, ranked by coverage of both sides.
 * A neutral rule on purpose: it uses no threshold of the demote recommendation, so the blind view
 * can show it. Pure: runs in the browser and on the server.
 */
export type Nearest = {
  target: string; target_uid: string; target_h: string; target_f: string; target_f_name: string;
  target_len: number;
  seq: Hit | null; struct: Hit | null;
  /** identity: the sequence hit's if there is one, else the structure hit's */
  pid: number; tcov: number; qcov: number; tm: number | null; substantial: boolean;
};

export function nearestReps(c: Case, k = 5): Nearest[] {
  const n = c.residues.length;
  const by = new Map<string, { seq: Hit | null; struct: Hit | null }>();
  for (const h of c.hits) {
    const g = by.get(h.target) ?? { seq: null, struct: null };
    const cur = g[h.src];
    if (!cur || h.bits > cur.bits) g[h.src] = h;
    by.set(h.target, g);
  }
  const out: Nearest[] = [];
  for (const [target, g] of by) {
    const any = (g.seq ?? g.struct)!;
    const span = (h: Hit | null) => (h ? (h.qe - h.qs + 1) / n : 0);
    const qcov = Math.max(span(g.seq), span(g.struct));
    const tcov = Math.max(g.seq?.tcov ?? 0, g.struct?.tcov ?? 0);
    out.push({
      target, target_uid: any.target_uid, target_h: any.target_h, target_f: any.target_f,
      target_f_name: any.target_f_name, target_len: any.target_len, seq: g.seq, struct: g.struct,
      pid: (g.seq ?? g.struct)!.pid, tcov, qcov, tm: g.struct?.tm ?? null,
      substantial: qcov >= 0.5 && tcov >= 0.5,
    });
  }
  out.sort((a, b) => (a.substantial !== b.substantial ? (a.substantial ? -1 : 1)
    : a.substantial ? b.pid - a.pid || (b.tm ?? 0) - (a.tm ?? 0)
      : b.qcov * b.tcov - a.qcov * a.tcov));
  return out.slice(0, k);
}

/** Structural alignment of a case with one manual rep (api/align), and the rep's own boundaries. */
export type Alignment = {
  qstart: number; qend: number; qlen: number; tstart: number; tend: number; tlen: number;
  fident: number; qtm: number; ttm: number; lddt: number;
  /** superposes the rep onto the case's frame: MolViewSpec order (3x3 column-major) */
  rotation: number[]; translation: number[];
  rep: { domain_id: string; range: string; length: number; type: string; h: string; h_name: string;
    t: string; t_name: string; f: string; f_name: string } | null;
};
