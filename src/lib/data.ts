import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';

/**
 * THE SNAPSHOT RULE. Everything this app shows comes from the frozen output of
 * ~/work/ecod_consistency_2027/prov_amalgam (recommend.py + build_index.py),
 * never from a live query. ecod_commons is curated in a parallel session and
 * moves under us (see sfld_inspect/SPEC.md, "The pinning rule"); a live join
 * would let the page and the recommendations TSV disagree about a domain.
 * Re-run the pipeline to refresh. census.json's `snapshot` is when the database was read; `built`
 * is when the recommendations were last computed from it.
 */
export const DATA_DIR = process.env.PROV_DATA_DIR
  || '/home/rschaeff/work/ecod_consistency_2027/prov_amalgam';

export type Rec = 'split' | 'trim' | 'demote' | 'retire' | 'keep';
export const RECS: Rec[] = ['split', 'trim', 'demote', 'retire', 'keep'];
export const REC_NOTE: Record<Rec, string> = {
  split: 'new boundaries resolving two or more domains',
  trim: 'new boundary resolving the one domain that is there; may no longer be a rep',
  demote: 'boundaries are right, but it duplicates a manual rep: make it that rep\'s member',
  retire: 'poor domain (disordered, low pLDDT, too short or unsupported); retire it',
  keep: 'no action: single, well-folded, and either divergent or not clearly wrong',
};

export type IndexRow = {
  uid: number; did: string; h: string; f: string; model: boolean; len: number;
  ratio: number | null; cls: string; sub: string; tier: string; rec: Rec; nd: number;
  plddt: number | null; lrc: number | null; mem: number; full: number; frag: number; why: string;
};

export type Census = {
  built: string;
  snapshot?: string;
  /** the prov_amalgam commit recommend.py ran from ('+dirty' if edited); absent before 2026-10-24 */
  pipeline?: string;
  n_cases: number;
  by_class_rec: { cls: string; rec: Rec; n: number }[];
  members_by_rec: Record<string, number>;
  hgroups: ({ h: string; name: string; n: number; members: number } & Record<Rec, number>)[];
};

export type Quality = { lrc: number | null; mean_plddt?: number; frac_lt50?: number };
export type Match = {
  src: 'seq' | 'struct'; target: string; target_uid: string; target_h: string; target_t: string;
  target_f: string; target_f_name: string; pid: number; tcov: number; prob: number | null; tm: number | null;
};
export type Piece = {
  start: number; end: number; length: number; range: string; quality: Quality;
  /** discontinuous pieces only: [start, end] runs (a domain with an insertion taken out) */
  parts?: [number, number][];
  match: Match | null; status: 'rep' | 'member_of_manual_rep' | 'unassigned_domain' | 'linker_or_disorder';
};
export type Hit = Omit<Match, 'target_f_name'> & {
  target_f_name: string; qs: number; qe: number; evalue: number; bits: number; target_len: number;
  /** only when the hit skips an insertion: the aligned blocks */
  blocks?: [number, number][];
};


export type Case = {
  ecod_uid: string; domain_id: string; h_id: string; t_id: string; f_id: string; f_name: string; h_name: string;
  type: string; range_definition: string; length: number; h_manual_median_len: string; len_ratio: string;
  call: { cls: string; subclass: string; evidence: string; tier: string };
  members: { active: number; full_length: number; fragments: number };
  /** [chain, auth_seq (with icode), aa, pLDDT|null], in file order; index i is position i+1. */
  residues: [string, string, string, number | null][];
  hits: Hit[];
  segments: Hit[];
  options: {
    split: { pieces: Piece[]; n_domains: number; viable: boolean } | null;
    trim: {
      piece: Piece; dropped_residues: number; dropped_frac: number; dropped_ranges: string[];
      drops_folded_region: boolean; caution: boolean; viable: boolean;
    } | null;
    /** One manual rep matches the whole domain at >=50% identity over >=80% of it. */
    demote?: { match: Match; range: string } | null;
    retire: { reasons: string[]; strong: boolean; quality: Quality };
  };
  recommendation: { primary: Rec; why: string };
  /** pilot A/B view only: two versions' proposals, in a per-case order that does not say which is which */
  alt?: { set: 'A' | 'B'; options: Case['options'] }[];
};

let index: Promise<IndexRow[]> | null = null;
let census: Promise<Census> | null = null;

export function getIndex(): Promise<IndexRow[]> {
  index ??= readFile(path.join(DATA_DIR, 'cases_index.json'), 'utf8').then(JSON.parse);
  return index;
}

export function getCensus(): Promise<Census> {
  census ??= readFile(path.join(DATA_DIR, 'census.json'), 'utf8').then(JSON.parse);
  return census;
}

export async function getCase(uid: string): Promise<Case | null> {
  if (!/^\d+$/.test(uid)) return null;
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, 'cases', `${parseInt(uid, 10)}.json`), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * A case with the pipeline's conclusions removed, for the pilot's labeling view. Whatever a server
 * page passes to a client component is readable in the page source, so hiding verdicts in the UI is not
 * enough: the call, the recommendation and every viable/strong flag are blanked here, on the server.
 * The proposals' geometry and measurements stay.
 */
export function blindCase(c: Case): Case {
  return {
    ...c,
    call: { cls: '', subclass: '', evidence: '', tier: '' },
    recommendation: { primary: 'keep', why: '' }, // placeholder only; the blind view never reads it
    options: blindOptions(c.options),
  };
}

/** Proposals' geometry only: the flags recommend.py adds (viable, strong, merged solenoid, cut disulfide)
 * hint at its verdict, so each option is rebuilt from the fields the view draws. */
function blindOptions(o: Case['options']): Case['options'] {
  return {
    split: o.split && { pieces: o.split.pieces, n_domains: o.split.n_domains, viable: false },
    trim: o.trim && {
      piece: o.trim.piece, dropped_residues: o.trim.dropped_residues, dropped_frac: o.trim.dropped_frac,
      dropped_ranges: o.trim.dropped_ranges, drops_folded_region: o.trim.drops_folded_region,
      caution: o.trim.caution, viable: false,
    },
    retire: { ...o.retire, strong: false },
  };
}

/**
 * Pilots that compare two pipeline versions: the case files of the earlier version, relative to DATA_DIR.
 * The blind view shows both versions' proposals as sets A and B; evidence comes from the current files.
 */
const AB_PILOTS: Record<string, string> = { pilot2: 'v1_backup/cases' };

export const isAbPilot = (pilot: string) => pilot in AB_PILOTS;

/** Which version is set A for a case: fixed per case by a hash, so scoring can recompute it. */
export function abFirst(pilot: string, uid: string | number): 'earlier' | 'current' {
  return createHash('sha256').update(`${pilot}:${uid}`).digest()[0] % 2 === 0 ? 'earlier' : 'current';
}

/** The options a proposal set ('A' or 'B') shows, for the label route to resolve a proposal source. */
export async function abOptions(pilot: string, uid: string, set: 'A' | 'B'): Promise<Case['options'] | null> {
  const dir = AB_PILOTS[pilot];
  if (!dir) return null;
  const earlier = (set === 'A') === (abFirst(pilot, uid) === 'earlier');
  try {
    const c: Case = earlier
      ? JSON.parse(await readFile(path.join(DATA_DIR, dir, `${parseInt(uid, 10)}.json`), 'utf8'))
      : (await getCase(uid))!;
    return blindOptions(c.options);
  } catch {
    return null;
  }
}

/** A blind case for a pilot: an A/B pilot's carries both versions' proposals, set A shown first. */
export async function pilotCase(pilot: string, c: Case): Promise<Case> {
  const b = blindCase(c);
  if (!AB_PILOTS[pilot]) return b;
  const a = await abOptions(pilot, c.ecod_uid, 'A');
  const bb = await abOptions(pilot, c.ecod_uid, 'B');
  if (!a || !bb) return b;
  return { ...b, options: a, alt: [{ set: 'A', options: a }, { set: 'B', options: bb }] };
}

/**
 * The blinded pilot (prov_amalgam/<ACTIVE_PILOT>, default pilot/): a frozen sample a curator labels before any agent sees it.
 * sample.json holds uids and presentation order only, never the stratum, so nothing here can hint at
 * the pipeline's recommendation. Labeling is open until <dir>/CLOSED exists.
 */
export type Pilot = { pilot: string; created: string; seed: number; items: { uid: number; order: number }[];
  dir: string };

/** The pilot being labeled: the directory named in DATA_DIR/ACTIVE_PILOT (default `pilot`, i.e. pilot1). */
function pilotDir(): string {
  try {
    const d = readFileSync(path.join(DATA_DIR, 'ACTIVE_PILOT'), 'utf8').trim();
    return /^[a-z0-9_]+$/.test(d) ? d : 'pilot';
  } catch {
    return 'pilot';
  }
}

export async function getPilot(): Promise<Pilot | null> {
  const dir = pilotDir();
  try {
    return { ...JSON.parse(await readFile(path.join(DATA_DIR, dir, 'sample.json'), 'utf8')), dir };
  } catch {
    return null;
  }
}

export function pilotOpen(p: Pilot | null): boolean {
  return !!p && !existsSync(path.join(DATA_DIR, p.dir, 'CLOSED'));
}

/** Cases kept out of the normal list, H-group pages and queue while labeling is open. */
export async function hiddenUids(): Promise<Set<number>> {
  const p = await getPilot();
  return pilotOpen(p) ? new Set(p!.items.map((x) => x.uid)) : new Set();
}

/** ecod_uid -> pre-cut domain file in the af2_pdb store (same layout prosmos_inspect uses). */
export function domainPdbPath(uid: number): string {
  const d = String(Math.floor(uid / 100)).padStart(5, '0');
  const u = String(uid).padStart(9, '0');
  return `/data/ecod/af2_pdb_domain_data/${d}/${u}/${u}.pdb`;
}
