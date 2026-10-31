# Weekly synchronisation

Keeps `pmos_knowledge_base.db` and `data/clean/*.csv` current with the public source databases.

    py sync/run_sync.py              # check upstream versions; re-harvest only if something changed
    py sync/run_sync.py --force      # re-harvest everything
    py sync/run_sync.py --check-only # only record upstream versions
    py sync/run_sync.py --offline    # rebuild from cached data/raw responses (no re-harvest)

Standard library only; no `pip install` needed.

## Schedule
`.github/workflows/weekly-sync.yml` runs it every **Wednesday 18:00 IST** (12:30 UTC).
If the data changed, the job commits it to the default branch, which triggers the Vercel deployment.
It can also be started by hand from the Actions tab (with an optional *force*).

## When does it re-harvest?
Each run records the upstream version of UniProt, Reactome, Open Targets (+ ChEMBL), Gene Ontology,
NCBI Gene, PubChem and PubMed. A full re-harvest runs when UniProt, Reactome or Open Targets has a new
release, or the last full sync is 28+ days old. NCBI Gene, PubChem and PubMed update continuously,
so they never trigger a run alone but are refreshed whenever one happens.

## Sources
Only these public databases are used: NCBI Gene and PubMed (E-utilities), UniProt, Reactome,
Gene Ontology (QuickGO), PubChem, and Open Targets (drug targets are ChEMBL-curated mechanisms of action).

## Safety
The new database is built beside the live one, validated (keys, provenance, foreign keys), stitched with
`backend/pmos_data.py` and index-tested before anything is replaced. If a check fails the run exits with an
error and the existing database and CSVs are left untouched.

## Files
- `harvest.py` source clients, cleaning, database build and validation (port of `notebook1.ipynb`)
- `drug_targets.py` Open Targets drug to target lookup (exact drug-name match; large complexes not expanded)
- `versions.py` upstream version checks
- `run_sync.py` orchestrator; writes `data/sync_state.json`, which the Data sources page reads
