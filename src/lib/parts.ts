import type { Hit } from '@/lib/data';

/* Discontinuous pieces and hits that skip an insertion. Pure: safe in client components (data.ts reads files). */
/** A piece's runs (one, unless it is discontinuous). */
export const partsOf = (p: { start: number; end: number; parts?: [number, number][] }): [number, number][] =>
  p.parts ?? [[p.start, p.end]];
export const blocksOf = (h: Hit): [number, number][] => h.blocks ?? [[h.qs, h.qe]];
/** sorted runs -> the complement within 1..n */
export function complement(rs: [number, number][], n: number): [number, number][] {
  const out: [number, number][] = [];
  let next = 1;
  for (const [a, b] of [...rs].sort((x, y) => x[0] - y[0])) {
    if (a > next) out.push([next, a - 1]);
    next = Math.max(next, b + 1);
  }
  if (next <= n) out.push([next, n]);
  return out;
}
