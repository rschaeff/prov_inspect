import Link from 'next/link';
import { getCensus, RECS } from '@/lib/data';

export const metadata = { title: 'Methods · prov_inspect' };

/**
 * How cases are built and recommendations reached. Every threshold here is
 * the constant of the same name in ~/work/ecod_consistency_2027/prov_amalgam
 * (classify.py, merge.py, recommend.py); change them together.
 */
export default async function Methods() {
  const census = await getCensus();
  const n = (rec: string) => census.by_class_rec.filter((x) => x.rec === rec).reduce((s, x) => s + x.n, 0);
  return (
    <div style={{ maxWidth: 820 }}>
      <h1>Methods</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        How each provisional rep becomes a case, and how a case reaches split, trim, retire or keep. Snapshot{' '}
        {census.built}. Code: <span className="mono">~/work/ecod_consistency_2027/prov_amalgam</span>.
      </p>

      <div className="panel toc">
        <a href="#scope">1. Scope</a><a href="#search">2. Searches</a><a href="#tiling">3. Tiling hits</a>
        <a href="#calls">4. Calls</a><a href="#quality">5. Quality measures</a><a href="#options">6. The three options</a>
        <a href="#primary">7. Primary recommendation</a><a href="#members">8. ecod_commons members</a>
        <a href="#decisions">9. Curator decisions</a><a href="#limits">10. Limitations</a>
      </div>

      <h2 id="scope">1. Scope</h2>
      <p>
        Reps come from <span className="mono">ecod_rep.domain</span>: <span className="mono">manual_rep</span> (21,233)
        or <span className="mono">provisional_manual_rep</span> (26,282). The H-group is the first two components of
        <span className="mono"> t_id</span>. An H-group is <em>mixed</em> when it holds both kinds; there are 1,934,
        holding 26,254 provisional reps with a sequence in <span className="mono">ecod_commons.domain_sequences</span>.
        Each of those is compared with <b>all</b> 21,225 manual reps, not just those in its own H-group, so a
        provisional rep that fuses domains from two H-groups can be recognised.
      </p>

      <h2 id="search">2. Searches</h2>
      <table>
        <thead><tr><th /><th>sequence</th><th>structure</th></tr></thead>
        <tbody>
          <tr><td>tool</td><td>MMseqs2 easy-search</td><td>Foldseek search</td></tr>
          <tr><td>input</td><td>domain sequences</td>
            <td>domain files from the af2_pdb store (66 provisional and 4 manual reps have none)</td></tr>
          <tr><td>settings</td><td className="mono">-s 7.5 -e 1e-3 --max-seqs 2000 --alt-ali 10</td>
            <td className="mono">-e 10 --max-seqs 2000 --alt-ali 10 -a</td></tr>
          <tr><td>kept</td><td>E ≤ 10⁻³</td><td>probability ≥ 0.5</td></tr>
        </tbody>
      </table>
      <p>
        <span className="mono">--alt-ali</span> keeps several alignments per target, so two copies of one domain in a
        rep both show up. Foldseek E-values against a library of single reps are far too strict (a manual Ig rep finds
        only 5 other Ig reps at 10⁻³), so its hits are filtered on probability instead.
      </p>

      <h2 id="tiling">3. Tiling hits into segments</h2>
      <p>
        Hits are taken in order of bit score. A hit becomes a <b>segment</b>, a stretch of the provisional rep explained
        by one manual rep, when:
      </p>
      <ul>
        <li>it spans at least <b>30</b> residues of the provisional rep;</li>
        <li>it covers at least <b>50%</b> of the manual rep (so a shared motif doesn&apos;t count as a domain);</li>
        <li>no more than <b>20%</b> of it overlaps segments already accepted.</li>
      </ul>
      <p>
        On the case page these are the &quot;tiled segments&quot; row of the track. For the recommendation step (§6) the
        two methods are combined: structure segments first, then sequence segments that fill what structure left open.
        Sequence positions are mapped onto the residue order of the domain file by aligning the two sequences, and
        Foldseek&apos;s per-chain positions are offset for multi-chain domains.
      </p>

      <h2 id="calls">4. Calls</h2>
      <p>Each method tiles its own hits and makes a call:</p>
      <table>
        <thead><tr><th>call</th><th>rule</th><th className="num">reps</th></tr></thead>
        <tbody>
          <tr><td><b>amalgam</b></td><td>≥ 2 segments together covering ≥ 60% of the rep. <i>Tandem</i> if all segments
            are in the rep&apos;s own H-group, <i>fusion</i> otherwise.</td><td className="num">1,227</td></tr>
          <tr><td><b>redundant</b></td><td>one segment covering ≥ 70% of the rep, at ≥ 50% identity over ≥ 80% of the
            manual rep</td><td className="num">889</td></tr>
          <tr><td><b>divergent</b></td><td>one segment covering ≥ 70%, below the redundancy bar</td>
            <td className="num">12,159</td></tr>
          <tr><td><b>partial</b></td><td>has hits, but the segments explain too little of the rep for either call
            above</td><td className="num">4,945</td></tr>
          <tr><td><b>no_hit</b></td><td>no hit at all from either method</td><td className="num">7,034</td></tr>
        </tbody>
      </table>
      <p>
        The two calls are merged by precedence, <b>amalgam &gt; redundant &gt; divergent &gt; partial &gt; no_hit</b>,
        so either method can raise a call; the case page shows which one made it (seq, struct or seq+struct). An
        amalgam also gets a <b>tier</b> from its length relative to the median manual rep in its H-group: <i>high</i> at
        ≥ 1.5× with sequence support, or ≥ 1.8× on structure alone; <i>medium</i> at ≥ 1.3×; <i>low</i> otherwise.
      </p>
      <p>
        Amalgam, partial, redundant and no_hit reps become <b>cases</b> ({census.n_cases.toLocaleString()}). Divergent
        reps are a single domain with a distant relative, which is what a provisional rep is meant to be, so they are
        not cases.
      </p>

      <h2 id="quality">5. Quality measures</h2>
      <p>Two measures decide whether a stretch of residues looks like a real domain:</p>
      <ul>
        <li>
          <b>pLDDT</b>, the AlphaFold confidence in the B-factor column. Computed models only; experimental structures
          have none. <i>Good</i> is a mean of ≥ 70; <i>poor</i> is &lt; 50.
        </li>
        <li>
          <b>Long-range contacts per residue (LRC)</b>: pairs of Cα atoms at least 6 apart in sequence and within 8 Å,
          divided by length. An isolated helix scores 0; the median manual rep scores 3.3 and the 5th percentile 1.0,
          so <b>LRC ≥ 1.0</b> is the bar for &quot;compact&quot;. This works for experimental structures too.
        </li>
      </ul>
      <p>
        A piece that matches a manual rep only has to pass pLDDT (its relative vouches for the fold). A piece that
        matches nothing must be at least <b>40</b> residues, pass pLDDT, <i>and</i> be compact.
      </p>

      <h2 id="options">6. The three options</h2>
      <p>Every case is evaluated for all three; the case page shows them side by side.</p>

      <h3><span className="tag r-split">split</span> new boundaries resolving two or more domains</h3>
      <ul>
        <li>Each gap (or overlap) between consecutive segments is cut at its midpoint.</li>
        <li>
          An unmatched terminus shorter than <b>20</b> residues is absorbed into its neighbouring piece; a longer one
          becomes a piece of its own.
        </li>
        <li>
          Each piece gets a status: <b>rep</b> (matches a manual rep), <b>member of manual rep</b> (matches one at
          ≥ 50% identity over ≥ 80% of it, so it would join that rep&apos;s family rather than be a rep),{' '}
          <b>unassigned domain</b> (no match but passes the unmatched-piece test in §5: a candidate new domain), or{' '}
          <b>linker/disorder</b>.
        </li>
        <li><b>Viable</b> when at least two pieces are domains (not linker) and every one of them passes §5.</li>
      </ul>

      <h3><span className="tag r-trim">trim</span> new boundary resolving the one domain that is there</h3>
      <ul>
        <li>
          Keeps the best segment, preferring one in the rep&apos;s own H-group, then the highest bit score. Termini
          shorter than 20 residues stay attached.
        </li>
        <li>
          The kept piece may be <b>member of manual rep</b> (same rule as for split): the domain is real but already
          represented, so after the trim it stops being a rep.
        </li>
        <li>
          <b>Viable</b> when the kept piece passes pLDDT and nothing dropped is itself a folded domain (≥ 40 residues,
          good pLDDT, compact). Dropping more than 30% of the rep is flagged <i>caution</i> but not blocked.
        </li>
      </ul>

      <h3><span className="tag r-retire">retire</span> the domain is poor</h3>
      <p>
        Reasons listed on the case page: mean pLDDT &lt; 50; more than half the residues below 50; fewer than 25
        residues; no match to any manual rep; no structure file; not compact (LRC &lt; 1.0). Only some of these are{' '}
        <b>strong</b> enough to decide the case on their own: <b>mean pLDDT &lt; 50</b>, <b>more than 60% of residues
        below 50</b>, or <b>fewer than 25 residues</b>.
      </p>

      <h2 id="primary">7. Primary recommendation</h2>
      <p>The first rule that applies wins:</p>
      <ol className="ladder">
        <li><span className="tag r-retire">retire</span> a strong retire reason (§6).</li>
        <li><span className="tag r-split">split</span> the split is viable.</li>
        <li>
          <span className="tag r-trim">trim</span> the trim is viable. For a <i>redundant</i> call, only when the
          trimmed piece becomes a member of the manual rep.
        </li>
        <li><span className="tag r-retire">retire</span> no hit at all and mean pLDDT &lt; 60.</li>
        <li>
          <span className="tag r-trim">trim</span> the call is <i>redundant</i>: demote to a member of the manual rep it
          duplicates.
        </li>
        <li>
          <span className="tag r-keep">keep</span> otherwise, with the reason given: well folded with no curated relative
          (genuinely divergent); hits are all fragmentary, so there is no boundary evidence; trimming would drop a
          folded region that matches nothing; or the matched pieces are not all well folded. A keep that is
          confidently predicted but not compact (helical bundles, coiled coils) is noted as non-globular rather than
          retired.
        </li>
      </ol>
      <table style={{ maxWidth: 420 }}>
        <thead><tr>{RECS.map((r) => <th key={r} className="num"><span className={`tag r-${r}`}>{r}</span></th>)}</tr></thead>
        <tbody><tr>{RECS.map((r) => <td key={r} className="num">
          <Link href={`/?rec=${r}`}>{n(r).toLocaleString()}</Link></td>)}</tr></tbody>
      </table>

      <h2 id="members">8. ecod_commons members</h2>
      <p>
        A member is a domain in <span className="mono">ecod_commons.domains</span> whose{' '}
        <span className="mono">representative_domain_id</span> is the provisional rep, excluding the rep itself and
        obsolete domains. <b>Full-length</b> members are at least 0.8× the rep&apos;s length; <b>fragments</b> are under
        0.6×. When a rep is split, its full-length members probably inherited the same amalgam and need re-parsing, and
        its fragments probably belong to one of the new pieces and need reassigning. A trimmed rep&apos;s members move
        with it, or with the manual rep it is demoted to. These counts are frozen with the snapshot.
      </p>

      <h2 id="decisions">9. Curator decisions</h2>
      <p>
        Recommendations are proposals. A curator&apos;s decision is logged to{' '}
        <span className="mono">ecod_curation.reference_domain_actions</span> (shared with pyecod_vis) together with the
        exact boundaries accepted, taken from the snapshot. The recommended action needs no reason; overriding it does.
        The latest row for a domain is the decision.
      </p>

      <h2 id="limits">10. Limitations</h2>
      <ul>
        <li>
          <b>Numbering.</b> Proposed ranges use the domain file&apos;s own numbering: UniProt/seqid for computed models,
          PDB author numbering for experimental structures. Experimental proposals must be converted to ECOD seqid
          ranges when applied. Each logged decision records which numbering it uses.
        </li>
        <li>
          <b>Repeat proteins.</b> In solenoid H-groups such as 109.4, a long rep matches several shorter repeat units,
          so amalgam and split calls there are the least reliable.
        </li>
        <li>
          <b>Experimental structures have no pLDDT.</b> Only compactness and length judge them, so they are rarely
          retired.
        </li>
        <li>
          <b>Midpoint cuts.</b> Split boundaries are placed halfway between segments, not refined against the structure;
          expect to adjust them by a few residues.
        </li>
        <li>
          <b>Snapshot.</b> Everything except curator decisions is frozen at {census.built}. ecod_commons is curated in
          parallel and may have moved since.
        </li>
      </ul>
    </div>
  );
}
