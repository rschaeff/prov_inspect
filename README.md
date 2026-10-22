# prov_inspect

Internal case browser for provisional ECOD reps (`ecod_rep.domain.provisional_manual_rep`) in H-groups that
also hold manual reps. Each case is a provisional rep called amalgam, partial, redundant or no-hit against the
manual reps. It comes with three evaluated options and one primary recommendation:

| option | meaning |
|---|---|
| **split** | new boundaries resolving two or more domains (matched to manual reps, or unmatched but folded) |
| **trim** | new boundary resolving the one domain that is there; it may then be a member of a manual rep rather than a rep |
| **retire** | poor domain: mean pLDDT < 50, more than 60% of residues below 50, or under 25 residues; or no hit and pLDDT < 60 |
| keep | none of the above is supported |

Built on the sfld_inspect pattern: Next 16, prebuilt Mol* from `public/molstar` (`sync_molstar.sh`), scenes
as MolViewSpec selecting by `auth_asym_id`/`auth_seq_id`. Domain files come from the af2_pdb store by
`ecod_uid` (the prosmos_inspect `/api/structure/[uid]` pattern).

## Snapshot, not live

The app reads only the frozen pipeline output in `PROV_DATA_DIR`
(default `~/work/ecod_consistency_2027/prov_amalgam`): `cases_index.json`, `census.json`, `cases/<uid>.json`.
Case data never comes from the database. `ecod_commons` is curated in a parallel session (see sfld_inspect/SPEC.md,
"The pinning rule"), and a live read would let the page and `results/recommendations.tsv` disagree. The
index is cached in memory, so restart the server after re-running the pipeline.

## Decisions (the pyecod_vis action log)

Curators log in with their `ecod_curation.curator` username (top right). Sessions use pyecod_vis's tables and
cookie, so a login on either app on leda counts for both. Each case page has a decision panel. Decisions are
appended to `ecod_curation.reference_domain_actions`, the table pyecod_vis defined, with the same DDL, so
pyecod_vis's history shows these rows too.

| action | meaning | stored proposal (`new_classification`) |
|---|---|---|
| `split` | accept the split | `pieces[]`: range, status, matched manual rep and F-group |
| `trim` | accept the trim | `piece`, `dropped` ranges |
| `remove` | retire (pyecod_vis's word) | `reasons` |
| `keep` | keep as is | none |
| `flag_review` | needs another look | none |

The proposal is rebuilt on the server from the snapshot case file, never sent by the browser. Each row also
carries `source: 'prov_inspect'`, the snapshot date, the pipeline's `recommended` action, and `numbering`
(`seqid` or `pdb_author`). `old_classification` holds t/f group, range_definition, call and member count.
A reason is required unless the curator is accepting the recommendation. The log is append-only: the latest
row per domain is the decision. The list has a decided/undecided filter, and "next undecided" on a case page
moves through the queue in list order, keeping the rec/cls/h filter.

```sql
SELECT DISTINCT ON (ecod_domain_id) ecod_domain_id, action, new_classification, reason, curator, created_at
  FROM ecod_curation.reference_domain_actions
 WHERE new_classification->>'source' = 'prov_inspect'
 ORDER BY ecod_domain_id, created_at DESC, id DESC;
```

Split and trim decisions take either the pipeline's proposal or the curator's own boundaries (a boundary
neither proposal found; `boundary_source: 'own'`, checked against the domain file, drawn on the structure
while typing). Own boundaries count as overriding the recommendation, so they need a reason.

## Pilot (blind labeling for the agent evaluation)

`/pilot` lists a frozen 90-case sample (`prov_amalgam/pilot/`, see its README) for labeling before any
agent runs. The labeling view hides every pipeline verdict, on the server, and while the pilot is open the
sample is hidden from the rest of the app. Labels go to `ecod_curation.prov_pilot_label`, not the decision
log. Close the pilot with `touch $PROV_DATA_DIR/pilot/CLOSED`.

## Pipeline (`~/work/ecod_consistency_2027/prov_amalgam`)

```bash
sbatch mmseqs/run_mmseqs.sh        # prov reps vs all manual reps, sequence
sbatch foldseek/run_foldseek.sh    # same, structure; -e 10 then prob >= 0.5 (E-values are too strict here)
python3 classify.py <m8> <out>     # tile hits -> amalgam / redundant / divergent / partial / no_hit
python3 merge.py                   # one call per rep + per-H-group summary
sbatch run_recommend.sh            # recommend.py x40: split / trim / retire options per case -> cases/*.json
python3 build_index.py             # results/recommendations.tsv, cases_index.json, census.json
```

Positions in proposals are in the domain file's own numbering: UniProt/seqid for computed models, **PDB author
numbering for experimental domains**. Converting an experimental proposal to an ECOD seqid range is still a
step to do at implementation time.

## Run

```bash
./start_background.sh --dev   # http://leda:4008
npm run build && ./start_background.sh   # production, http://leda:3008
./stop_server.sh
```
