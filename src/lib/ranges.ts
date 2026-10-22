/**
 * Curator-typed boundaries, checked against the domain file's own residues.
 *
 * Syntax follows ECOD range_definition: a domain is comma-separated segments (A:1-50,A:200-250, which
 * allows discontinuous domains); domains are separated by ';' or new lines. Numbers are the file's
 * own numbering: UniProt/seqid for computed models, PDB author numbering (insertion codes allowed,
 * e.g. A:52A-90) for experimental structures. Pure: runs in the browser and on the server.
 */

export type Residue = [string, string, ...unknown[]];
export type ParsedDomain = { range: string; segments: { start: number; end: number }[]; length: number };

/** -> domains, normalised (chain:start-end, comma-joined), or an error message naming the problem. */
export function parseBoundaries(text: string, residues: Residue[]): { domains: ParsedDomain[] } | { error: string } {
  const at = new Map(residues.map((r, i) => [`${r[0]}:${r[1]}`, i + 1]));
  const taken = new Map<number, number>();
  const domains: ParsedDomain[] = [];
  const blocks = text.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
  if (!blocks.length) return { error: 'no boundaries given' };
  for (const [d, block] of blocks.entries()) {
    const segments: ParsedDomain['segments'] = [];
    for (const seg of block.split(',').map((s) => s.trim()).filter(Boolean)) {
      const m = seg.match(/^([A-Za-z0-9]):(-?\d+[A-Za-z]?)-(-?\d+[A-Za-z]?)$/);
      if (!m) return { error: `"${seg}" is not chain:start-end` };
      const [, chain, a, b] = m;
      const s = at.get(`${chain}:${a}`);
      const e = at.get(`${chain}:${b}`);
      if (!s) return { error: `${chain}:${a} is not a residue in this domain file` };
      if (!e) return { error: `${chain}:${b} is not a residue in this domain file` };
      if (e < s) return { error: `"${seg}" runs backwards` };
      for (let i = s; i <= e; i++) {
        if (taken.has(i)) return { error: `"${seg}" overlaps domain ${taken.get(i)! + 1}` };
        taken.set(i, d);
      }
      segments.push({ start: s, end: e });
    }
    domains.push({
      range: segments.map((g) => `${residues[g.start - 1][0]}:${residues[g.start - 1][1]}-${residues[g.end - 1][1]}`).join(','),
      segments, length: segments.reduce((n, g) => n + g.end - g.start + 1, 0),
    });
  }
  return { domains };
}

/** What a split or trim needs: at least two domains for a split, exactly one for a trim. */
export function checkCount(action: 'split' | 'trim', n: number): string | null {
  if (action === 'split' && n < 2) return 'a split needs at least two domains (separate them with ; or a new line)';
  if (action === 'trim' && n !== 1) return 'a trim keeps exactly one domain';
  return null;
}
