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
    label: 'Backend configured',
    backendConfigured: true,
    detail: `Reading from ${apiConfig.baseUrl}`,
  };
}

export async function getFeaturedEntities(): Promise<Entity[]> {
  const found = await Promise.all(FEATURED_IDS.map((id) => getEntityById(id)));
  return found.filter((e): e is Entity => e !== null);
}

export interface PathwayDetail {
  pathway: Pathway;
  proteins: Entity[];
  genes: Entity[];
  processes: Entity[];
  hormones: Entity[];
  therapeutics: Entity[];
  publications: Publication[];
  neighbours: Neighbour[];
}

/** Composed from primitives so it works against either backend. */
export async function getPathwayDetail(id: string): Promise<PathwayDetail | null> {
  const pathway = await getEntityById(id);
  if (!pathway || pathway.type !== 'pathway') return null;
  const neighbours = await getEntityRelationships(id);
  const ofType = (t: Entity['type']) => neighbours.filter((n) => n.entity.type === t).map((n) => n.entity);
  const proteins = ofType('protein');
  const geneLists = await Promise.all(proteins.map((p) => getEntityRelationships(p.id)));
  const genes = geneLists
    .flat()
    .filter((n) => n.entity.type === 'gene' && n.relationship.label === 'encodes')
    .map((n) => n.entity);
  return {
    pathway,
    proteins,
    genes,
    processes: ofType('process'),
    hormones: ofType('hormone'),
    therapeutics: ofType('therapeutic'),
    publications: ofType('publication') as Publication[],
    neighbours,
  };
}

export interface TherapeuticDetail {
  therapeutic: Therapeutic;
  neighbours: Neighbour[];
  genes: Entity[];
  pathways: Entity[];
  publications: Entity[];
}

export async function getTherapeuticDetail(id: string): Promise<TherapeuticDetail | null> {
  const t = await getEntityById(id);
  if (!t || t.type !== 'therapeutic') return null;
  const neighbours = await getEntityRelationships(id);
  const ofType = (type: Entity['type']) => neighbours.filter((n) => n.entity.type === type).map((n) => n.entity);
  return {
    therapeutic: t,
    neighbours,
    genes: ofType('gene'),
    pathways: ofType('pathway'),
    publications: ofType('publication'),
  };
}

/** Entity the BioGraph opens on by default. */
export const getDefaultGraphFocus = (): string => DEFAULT_GRAPH_FOCUS;
