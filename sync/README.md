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
Gene Ontology (QuickGO), PubChem, Open Targets (drug targets are ChEMBL-curated mechanisms of action), and
the Protein Data Bank and AlphaFold database (structures, linked through each protein's UniProt cross-references), and two
U.S. National Library of Medicine sources for the chat glossary: MeSH (term definitions) and NIH MedlinePlus Health Topics
(plain-language symptoms, causes, risk and diagnosis).

The glossary is the source's own text, never reworded. Which terms to look up is the only hand-written part
(`glossary_terms.csv`). MedlinePlus search is fuzzy, so a topic is accepted only when its title is exactly the one asked for;
treatment, prevention and management headings are skipped and any remaining sentence that mentions treatment, therapy or medicines
is removed. A term neither source resolves is listed in `unresolved_mappings.csv`.

PDB entries per protein can number in the hundreds, so only the 8 best-resolved are stored (`STRUCTURES_PER_PROTEIN`),
with the total count and a link to the full list on PDBe-KB.

## Safety
The new database is built beside the live one, validated (keys, provenance, foreign keys), stitched with
`backend/pmos_data.py` and index-tested before anything is replaced. If a check fails the run exits with an
error and the existing database and CSVs are left untouched.

## Files
- `harvest.py` source clients, cleaning, database build and validation (port of `notebook1.ipynb`)
- `drug_targets.py` Open Targets drug to target lookup (exact drug-name match; large complexes not expanded)
- `glossary.py` MeSH and MedlinePlus harvest for the glossary tables (`glossary_term`, `glossary_section`)
- `../glossary_terms.csv` the terms to look up (term, MeSH heading, MedlinePlus title, aliases)
- `versions.py` upstream version checks
- `run_sync.py` orchestrator; writes `data/sync_state.json`, which the Data sources page reads
