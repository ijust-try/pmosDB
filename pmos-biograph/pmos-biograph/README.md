# PMOS · BIOGRAPH

Frontend for the **PMOS Biological Knowledge Base**: an interactive research interface for exploring genes, proteins, hormones,
biomarkers, pathways, therapeutics and publications related to Poly Endocrine Metabolic Ovarian Syndrome.

This is **Part C (front-end delivery)** of the project work breakdown. It runs entirely on a clearly labelled **demonstration
dataset** so it can be developed and demoed before the backend and relational database (Parts A and B) exist. When they do, only the
service layer changes.

---

## Run it

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other commands:

```bash
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

Dependencies (already in `package.json`): `react`, `react-dom`, `react-router-dom`, `tailwindcss@3`, `lucide-react`, `recharts`,
`cytoscape`, `cytoscape-fcose`, `framer-motion`, `@fontsource-variable/manrope`, `@fontsource/ibm-plex-mono`. Fonts are bundled
locally, so nothing needs a network, a paid API or an API key.

---

## What is in it

| Route | Page | Notes |
|---|---|---|
| `/` | Overview | Metrics, interactive graph preview, featured records, dataset composition, integration status |
| `/explore` | Explore Entities | Search, type/source filters, sort, table/list views, pagination, side-panel preview |
| `/entity/:id` | Entity dossier | Tabs: Overview, Relationships, Evidence, Sources; neighbourhood graph; per-field provenance |
| `/graph?focus=<id>` | **BioGraph** | Cytoscape knowledge graph (pan, zoom, drag, select, search, filters, expand, path, fit, reset) |
| `/pathways` | Pathways | Catalogue + simplified relationship diagram + member entities |
| `/therapeutics` | Therapeutics | Catalogue + chemical info; research interface only |
| `/evidence` | Research & Evidence | Publication browser with year / entity / evidence-category filters |
| `/sources` | Data Sources | Per-source status, validation placeholders, backend connection settings |
| `/search?q=` | Search results | Grouped, with no-results guidance |

Global search is available everywhere: `/` or `Ctrl/Cmd+K` focuses it, arrow keys move, Enter opens, Esc clears.

---

## Architecture

```
src/
  app/            App shell, router
  components/
    layout/       Sidebar, Topbar, breadcrumbs, command search, brand mark
    ui/           Badges, tabs, states (loading / empty / error), page headers
    entities/     Table, list, preview drawer, dossier view, chips
    graph/        GraphCanvas (Cytoscape wrapper), legend/filters, search, info panel, MiniGraph
    charts/       Recharts components
  pages/          One file per route
  services/       ← the ONLY data-access layer (see below)
  data/           mock.ts: the ONLY file containing mock records
  hooks/          useAsync, useDebounce
  types/          Domain model (Gene, Protein, Hormone, … Relationship)
  utils/          Entity metadata (colours, icons, labels)
  styles/         Tailwind entry + global styles
```

**Rule:** components never import `data/mock.ts` and never call `fetch`. They call functions from `src/services/repository.ts`:

`searchEntities()`, `listEntities()`, `getEntityById()`, `getEntityRelationships()`, `getGraphNeighbourhood()`, `getPathways()`,
`getPathwayDetail()`, `getTherapeutics()`, `getTherapeuticDetail()`, `getPublications()`, `getDataSourceStatus()`,
`getDatasetSummary()`, `getDatasetStatus()`, `getFeaturedEntities()`.

All of them are `async`, so swapping in network calls changes no component.

### Design system (PMOS / BIOGRAPH)

- Warm-white editorial surfaces, midnight-navy navigation and graph canvas, restrained teal / sage / lavender accents.
- Manrope for interface text, IBM Plex Mono for scientific identifiers.
- Tokens live in `tailwind.config.js`; per-entity-type colour, icon and graph shape live in `src/utils/entityMeta.ts`.
- Motion is subtle and respects `prefers-reduced-motion` (Framer Motion `MotionConfig` plus graph animation checks).

---

## Mock data and scientific integrity

The demo dataset (`src/data/mock.ts`) is deliberately small and honest.

- **`project-document`** provenance: the fact or identifier appears in the PMOS progress document: CYP17A1 (NCBI Gene 1586,
  UniProt P05093), metformin (PubChem CID 4091), the CYP17A1 rs743572 publication *title*, the AMH biomarker, and the relationships
  that document describes (gene → protein → pathway, hormone → process, publication support).
- **`unverified-demo`** provenance: illustrative records added so the interface can be shown. Their identifiers (e.g. AR, CYP19A1,
  testosterone's PubChem CID) were **not** verified against the source databases and are shown with a visible warning.
  **Validate or replace them during integration.**
- Nothing is invented where it would be harmful: no PMIDs, authors, years, evidence scores, reaction sequences, mechanisms, doses or
  efficacy claims. Unknown fields are `null` and render as "Not recorded" / "Not yet curated".
- Relationships are **associations, not causal claims**. Edges that come from the project document are solid; illustrative edges are
  dashed in the graph and badged everywhere else.
- Source links appear only for identifiers that came from the project document.

Because of this the counts on the Overview (e.g. 1 therapeutic, 1 publication) reflect the demo dataset only, and the page says so.

---

## Connecting the real backend

Everything backend-related is in `src/services/`.

1. **Configure** (`.env`, see `.env.example`):
   ```
   VITE_USE_MOCK=false
   VITE_API_BASE_URL=http://localhost:8000/api
   ```
2. **Endpoints**: `src/services/api.config.ts` declares the assumed REST contract (`/search`, `/entities`, `/entities/:id`,
   `/entities/:id/relationships`, `/graph`, `/pathways`, `/therapeutics`, `/publications`, `/sources`, `/summary`). Edit paths there to
   match the real API.
3. **HTTP calls**: `src/services/remoteBackend.ts` implements the `Backend` interface (`backend.ts`) with `fetch`, a timeout and
   typed `ApiError`s. This is where API calls are made, and where the API in turn queries the relational database.
4. **Response normalisation**: `src/services/normalisers.ts` is the *single place* where raw payloads become the UI types in
   `src/types`. Today they pass data through; map your column names / nesting here (e.g. database rows → `Entity`).
5. **Database queries** (server side) should provide:
   - **Search / list**: match name, aliases, identifiers, description; filter by `types` and `sources`; sort; paginate.
   - **Relationships**: for an entity id, return neighbours with the relationship row (`label`, `status`, optional `note`) and
     direction. Rows should carry a provenance/validation status that maps onto `project-document` / `demo-unvalidated`
     (or replace these with real statuses by updating `RelationStatus`).
   - **Graph**: `GET /graph?focus=<id>&depth=<n>` returning `{ entities, relationships }` for the neighbourhood.
   - **Sources**: connection status and `lastSync` per source, so the Data Sources page reflects reality.
6. The mock backend (`mockBackend.ts`) stays as the reference implementation of the same interface, and is handy for tests and demos.

Known assumptions to revisit when the API exists: the BioGraph's *expand* fetches neighbours of each newly revealed node to draw
edges between them (N+1 calls). If the real API is slower, add a batch endpoint (e.g. `/graph/expand?ids=`) and call it from
`BioGraphPage.tsx`.

---

## Accessibility and quality

- Keyboard: skip link, visible focus rings, accessible tabs (arrow keys), combobox search with `aria-activedescendant`, sortable table
  headers with `aria-sort`, drawer closes on Esc.
- The graph canvas is not keyboard-navigable by nature, so the side panel lists every visible node as buttons and lets you move
  through connected entities without a mouse.
- Loading, empty, no-results and error states exist for every data-driven view (`components/ui/States.tsx`). Set
  `VITE_USE_MOCK=false` with no backend running to see the error state.
- `npm run build` runs a strict TypeScript check; the build is clean.

## Suggested next steps

- Replace `unverified-demo` identifiers with validated ones once the NCBI / UniProt / PubChem imports exist.
- Add unit tests around `mockBackend` search scoring and the normalisers once real payloads are known.
- Code-split the BioGraph route (`React.lazy`) if bundle size matters; Cytoscape is the largest dependency.
