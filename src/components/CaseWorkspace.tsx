'use client';

import { useState } from 'react';
import CaseView from './CaseView';
import DecisionPanel from './DecisionPanel';
import type { Action } from '@/lib/actions';
import type { Case } from '@/lib/data';
import type { ParsedDomain } from '@/lib/ranges';

/** The decision panel and the case view, sharing the curator's own boundaries so they draw as they are typed. */
export default function CaseWorkspace({ c, recommended, nextHref }: { c: Case; recommended: Action; nextHref: string }) {
  const [mine, setMine] = useState<ParsedDomain[] | null>(null);
  const split = c.options.split?.pieces.filter((p) => p.status !== 'linker_or_disorder').map((p) => p.range) ?? [];
  return (
    <>
      <DecisionPanel uid={c.ecod_uid} recommended={recommended} nextHref={nextHref} residues={c.residues}
        proposals={{ split: split.length > 1 ? split : null, trim: c.options.trim?.piece.range ?? null,
          demote: c.options.demote?.match.target ?? null }}
        onMine={setMine} />
      <CaseView c={c} mine={mine} />
    </>
  );
}
