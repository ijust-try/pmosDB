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
`/therapeutics`, `/publications`, `/sources`, `/summary`), plus `/sync` (sync status) and
`/retrieve` (chatbot evidence, see below). Every entity/relationship it
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

## Chatbot retrieval (`retrieval.py`, `GET /api/retrieve?q=...`)

Decides what the knowledge base can support for a question and gathers the evidence. It never calls an AI
model or the network: it is deterministic, free and tested. In order:

1. **refuse**: dosing, personal medical advice and treatment/efficacy questions are refused (the site makes no such claims).
2. **link**: requests for a link, page or identifier are answered straight from the records (`compose_extractive`).
3. **qa**: BM25F search over names, identifiers, aliases, descriptions, abstracts and neighbours, then graph expansion
   (drug to target gene to protein to pathway to papers). If the records do not cover the question's informative words the
   result is `no_evidence` and nothing is generated.

Each record has a citation ref (`R1`...), its page on this site, external source URLs, and a `via` line saying how it is
linked. Records that only match the question's wording are labelled so. `unmatchedTerms` lists question words found in no
record, so an answer can say what the knowledge base does not cover. A link request only succeeds when a record's own
name matches, never on a loose text match.

The question benchmark is `eval/retrieval_cases.json`, run by `tests/test_retrieval_eval.py`. Known limit: matching is
lexical, so a synonym that is not in a record (for example "LH receptor" for LHCGR) finds nothing and the bot says so
rather than guessing. Embeddings could close that gap later.

## Chat (`chat.py`, `POST /api/chat`)

`{"question": "...", "context": "<optional record id the visitor is viewing>"}` returns `{answer, mode, status, intent, records,
citations, suggestions, unmatchedTerms, notice}`. `mode` is `"model"` (a generated, verified answer) or `"database"`
(built from the records alone).

The model (Gemini, free tier) is the last step. Refused, no-evidence, greeting and link questions never reach it. For an
open question with evidence, the model sees only the retrieved records, and its answer is shown only if it passes
`check_answer`; otherwise the visitor gets the plain records and a notice, so a failure shows less and never invents.
A generated answer is accepted only when:

- every sentence stating a fact cites records that exist, and no factual sentence is uncited;
- each sentence's gene/protein/drug symbols, identifiers and numbers (decimals, percentages, anything above 20) appear in
  the records **that sentence cites**, and most of its key words appear there too;
- it contains no dosing, efficacy or safety language;
- links come from the records, never from the model (they are appended as "Sources").

`eval/answer_cases.json` holds 10 faithful and 16 unfaithful canned answers (run by `tests/test_answer_checks.py`).

Known limits of the check (it is word-level, not understanding): it cannot see a reversed relation made only of words the
record contains ("androgen receptor agonist" for an antagonist), or a number that appears in the cited record but belongs to a
different statistic. These are listed in the benchmark as `known_gaps`.

Configuration (environment variables; none are stored in the repository):

| variable | default | meaning |
|---|---|---|
| `GEMINI_API_KEY` | none | the Gemini key. Without it every answer comes from the database. Set it in Vercel, never in code. |
| `GEMINI_MODEL` | `gemini-flash-lite-latest` | model name. Check speed and availability for your key with `py backend/gemini_probe.py` |
| `CHAT_REQUESTS_PER_MINUTE` | 20 | per visitor, all chat requests (HTTP 429 above this) |
| `CHAT_AI_PER_MINUTE` / `CHAT_AI_PER_DAY` | 6 / 40 | per visitor, model calls only; above this the records are shown instead |
| `CHAT_AI_GLOBAL_PER_DAY` | 300 | model calls per day per server instance |

Limits are in memory, so each serverless instance counts separately: they are best-effort. The hard cost cap is the free
quota of a Google project with no billing attached. Recent answers are cached for an hour, and the model is paused for ten
minutes after the provider reports its quota is used.

Try it locally (the key stays in your terminal session):

```powershell
$env:GEMINI_API_KEY = "<your key>"
py backend/chat.py "what does flutamide do"
```
