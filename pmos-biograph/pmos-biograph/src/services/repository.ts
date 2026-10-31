/**
 * REPOSITORY: the only data API the UI is allowed to use.
 * Components call these functions; they never import `data/mock.ts` or `fetch` directly.
 */
import { DEFAULT_GRAPH_FOCUS, FEATURED_IDS } from '../data/mock';
import type {
  DataSource,
  DatasetStatus,
  DatasetSummary,
  Entity,
  GraphData,
  ListItem,
  ListQuery,
  Neighbour,
  Page,
  Pathway,
  Publication,
  PublicationItem,
  PublicationQuery,
  SearchHit,
  SearchOptions,
  SyncStatus,
  Therapeutic,
} from '../types';
import { apiConfig } from './api.config';
import type { Backend } from './backend';
import { mockBackend } from './mockBackend';
import { remoteBackend } from './remoteBackend';

const backend = (): Backend => (apiConfig.useMock ? mockBackend : remoteBackend);

export const searchEntities = (query: string, options?: SearchOptions): Promise<SearchHit[]> =>
  backend().search(query, options);

export const listEntities = (query: ListQuery): Promise<Page<ListItem>> => backend().list(query);

export const getEntityById = (id: string): Promise<Entity | null> => backend().getEntity(id);

export const getEntityRelationships = (id: string): Promise<Neighbour[]> => backend().getNeighbours(id);

export const getGraphNeighbourhood = (focusId: string, depth = 2): Promise<GraphData> =>
  backend().getGraph(focusId, depth);

export const getPathways = (): Promise<Pathway[]> => backend().getPathways();

export const getTherapeutics = (): Promise<Therapeutic[]> => backend().getTherapeutics();

export const getPublications = (query?: PublicationQuery): Promise<PublicationItem[]> =>
  backend().getPublications(query);

export const getDataSourceStatus = (): Promise<DataSource[]> => backend().getSources();

export const getSyncStatus = (): Promise<SyncStatus | null> => backend().getSyncStatus();

export const getDatasetSummary = (): Promise<DatasetSummary> => backend().getSummary();

export async function getDatasetStatus(): Promise<DatasetStatus> {
  if (apiConfig.useMock) {
    return {
      mode: 'demo',
      label: 'Demonstration dataset',
      backendConfigured: false,
      detail: 'Records are illustrative. Backend and database are not connected yet.',
    };
  }
  return {
    mode: 'live',
    label: 'Live data',
    backendConfigured: true,
    detail: 'Records are read from the PMOS knowledge base.',
  };
}

export async function getFeaturedEntities(): Promise<Entity[]> {
  const found = await Promise.all(FEATURED_IDS.map((id) => getEntityById(id)));
  return found.filter((e): e is Entity => e !== null);
}

/**
 * Follows links across several hops over one graph payload (undirected). Used for relationships
 * that are derived rather than stored, e.g. a drug's pathways = drug -> target gene -> protein -> pathway.
 */
function graphIndex(graph: GraphData) {
  const byId = new Map(graph.entities.map((e) => [e.id, e]));
  const adjacent = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adjacent.has(a)) adjacent.set(a, new Set());
    adjacent.get(a)!.add(b);
  };
  for (const r of graph.relationships) {
    link(r.source, r.target);
    link(r.target, r.source);
  }
  /** Entities of `type` directly connected to any of `from`. */
  return (from: Entity[], type: Entity['type']): Entity[] => {
    const out = new Map<string, Entity>();
    for (const e of from) {
      for (const id of adjacent.get(e.id) ?? []) {
        const n = byId.get(id);
        if (n && n.type === type) out.set(n.id, n);
      }
    }
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  };
}

export interface PathwayDetail {
  pathway: Pathway;
  proteins: Entity[];
  /** Genes encoding the pathway's member proteins. */
  genes: Entity[];
  /** Processes linked to those member genes (e.g. PCOS via Open Targets). */
  processes: Entity[];
  /** Hormones associated with member proteins. */
  hormones: Entity[];
  /** Drugs whose curated target is a member gene. */
  therapeutics: Entity[];
  /** Literature supporting member genes. */
  publications: Publication[];
  neighbours: Neighbour[];
}

/** Composed from primitives so it works against either backend. */
export async function getPathwayDetail(id: string): Promise<PathwayDetail | null> {
  const pathway = await getEntityById(id);
  if (!pathway || pathway.type !== 'pathway') return null;
  const [neighbours, graph] = await Promise.all([getEntityRelationships(id), getGraphNeighbourhood(id, 3)]);
  const next = graphIndex(graph);
  const proteins = next([pathway], 'protein');
  const genes = next(proteins, 'gene');
  return {
    pathway,
    proteins,
    genes,
    processes: next(genes, 'process'),
    hormones: next(proteins, 'hormone'),
    therapeutics: next(genes, 'therapeutic'),
    publications: next(genes, 'publication') as Publication[],
    neighbours,
  };
}

export interface TherapeuticTarget {
  gene: Entity;
  /** Curated mechanism of action and source, from the relationship record. */
  note?: string;
}

export interface TherapeuticDetail {
  therapeutic: Therapeutic;
  neighbours: Neighbour[];
  /** Curated target genes (Open Targets / ChEMBL mechanism of action). */
  genes: Entity[];
  targets: TherapeuticTarget[];
  /** Pathways reached through the target genes' proteins. */
  pathways: Entity[];
  /** Processes linked to the target genes (e.g. PCOS association). */
  processes: Entity[];
  /** Gene Ontology biological processes annotated on the target proteins. */
  goProcesses: string[];
  publications: Entity[];
}

export async function getTherapeuticDetail(id: string): Promise<TherapeuticDetail | null> {
  const t = await getEntityById(id);
  if (!t || t.type !== 'therapeutic') return null;
  const [neighbours, graph] = await Promise.all([getEntityRelationships(id), getGraphNeighbourhood(id, 3)]);
  const next = graphIndex(graph);
  const ofType = (type: Entity['type']) => neighbours.filter((n) => n.entity.type === type).map((n) => n.entity);
  const genes = ofType('gene');
  const proteins = next(genes, 'protein');
  const goProcesses = [
    ...new Set(
      proteins.flatMap((p) => p.annotations.filter((a) => a.label === 'GO (biological_process)').map((a) => a.value)),
    ),
  ].sort((a, b) => a.localeCompare(b));
  return {
    therapeutic: t,
    neighbours,
    genes,
    targets: neighbours
      .filter((n) => n.entity.type === 'gene' && n.relationship.label === 'targets')
      .map((n) => ({ gene: n.entity, note: n.relationship.note })),
    pathways: next(proteins, 'pathway'),
    processes: next(genes, 'process'),
    goProcesses,
    publications: ofType('publication'),
  };
}

/** Entity the BioGraph opens on by default. */
export const getDefaultGraphFocus = (): string => DEFAULT_GRAPH_FOCUS;
