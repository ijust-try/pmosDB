# PMOS knowledge base: relational layer + API (Person B)

Sits between Person A's data (`pmos_knowledge_base.db`, `data/clean/*.csv`) and Person C's
frontend (`pmos-biograph/`). No third-party packages required — stdlib only.

## What this adds to the database

`pmos_data.init_relationships()` creates (if missing) and repopulates these tables,
each with real `FOREIGN KEY` constraints back to Person A's tables:

| table | links | derived from |
|---|---|---|
| `gene_protein_link` | gene ↔ protein | `proteins.gene_symbol` |
| `protein_pathway_link` | protein ↔ pathway | `data/clean/protein_pathway_map.csv` |
| `entity_publication_link` | gene/hormone/biomarker/therapeutic ↔ publication | `data/clean/entity_publication_map.csv` |
| `gene_pcos_association` | gene ↔ PCOS (process) | `data/clean/open_targets_pcos.csv`, filtered to genes already in `genes` |
| `biomarker_protein_link` | biomarker ↔ protein | `biomarkers.uniprot_accession` = `proteins.protein_id` |
| `hormone_protein_link` | hormone ↔ protein | `hormones.uniprot_accession` = `proteins.protein_id` |
| `therapeutic_target` | drug ↔ gene | curated mechanism-of-action targets from Open Targets (ChEMBL), harvested by `sync/` |

Every join is sourced (`RelationStatus = 'project-document'`). Drug → gene `targets` edges
come only from Open Targets mechanism-of-action records (curated by ChEMBL); the earlier
regex match on mechanism text has been removed. Each edge's `note` carries the mechanism
and the ChEMBL id. Pathways, hormones, processes and publications shown for a drug or
pathway are derived in the frontend by following these edges (gene → protein → pathway);
they are not stored as separate edges.

Run it standalone to (re)build the tables without starting the server:

```
py -c "import pmos_data as pd; c = pd.get_connection(); pd.init_relationships(c); print('ok')"
```

(run from inside `backend/`, or add it to `sys.path`.)

## Multi-table search

- `pmos_data.sql_search(conn, term)` — literal `UNION ALL` + `LIKE` across all seven
  entity tables, straight SQL, useful from a notebook or `sqlite3` CLI.
- `pmos_data.search_entities(index, query, types, sources, limit)` — ranked search used
  by the API; reproduces the frontend's own scoring (`mockBackend.ts`'s `scoreEntity`)
  so the demo and live backends feel identical to use.

## API server

`server.py` is a zero-dependency `http.server` implementing the exact REST contract
`pmos-biograph/pmos-biograph/src/services/api.config.ts` expects (`/search`,
`/entities`, `/entities/:id`, `/entities/:id/relationships`, `/graph`, `/pathways`,
`/therapeutics`, `/publications`, `/sources`, `/summary`). Every entity/relationship it
returns is shaped to match `src/types/index.ts` exactly, so
`src/services/normalisers.ts` (a pass-through cast today) needs no changes.

```
py server.py
```

Then point the frontend at it — in `pmos-biograph/pmos-biograph/.env`:

```
VITE_API_BASE_URL=http://localhost:8000/api
VITE_USE_MOCK=false
```

## ID scheme (must match Person C's existing conventions)

`gene-<symbol>`, `protein-<gene symbol>`, `pathway-<slug of pathway name>`,
`hormone-<slug of name>`, `biomarker-<slug of name>`, `therapeutic-<slug of drug name>`,
`publication-<pmid>`, plus one hand-built node `process-pcos` representing PCOS itself
(genes attach to it via Open Targets association scores). This matches the IDs already
hardcoded in `pmos-biograph`'s `src/data/mock.ts` (`DEFAULT_GRAPH_FOCUS =
'gene-cyp17a1'`, etc.) wherever an equivalent real record exists.

## Known gaps (by design, not bugs)

- `open_targets_pcos.csv` has 500 genes; only the 36 already curated into `genes` get a
  `gene_pcos_association` row and therefore a graph edge. The other 464 are not
  fabricated into `Gene` entities.
- Drugs with no curated mechanism of action in Open Targets (currently Myo-inositol and
  N-Acetylcysteine) have no `targets` edge, so they show no genes or pathways. Mechanisms
  that target a large protein complex (e.g. Metformin → mitochondrial complex I, ~50
  subunits) are not expanded into gene edges; see `unresolved_mappings.csv`.
