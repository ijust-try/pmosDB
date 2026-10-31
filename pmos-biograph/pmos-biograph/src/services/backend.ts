import type {
  DataSource,
  DatasetSummary,
  Entity,
  GraphData,
  ListItem,
  ListQuery,
  Neighbour,
  Page,
  Pathway,
  PublicationItem,
  PublicationQuery,
  SearchHit,
  SearchOptions,
  SyncStatus,
  Therapeutic,
} from '../types';

/**
 * The data-access contract. `mockBackend` and `remoteBackend` both implement it.
 * The repository (and therefore the whole UI) is agnostic to which one is active.
 */
export interface Backend {
  search(query: string, options?: SearchOptions): Promise<SearchHit[]>;
  list(query: ListQuery): Promise<Page<ListItem>>;
  getEntity(id: string): Promise<Entity | null>;
  getNeighbours(id: string): Promise<Neighbour[]>;
  getGraph(focusId: string, depth: number): Promise<GraphData>;
  getPathways(): Promise<Pathway[]>;
  getTherapeutics(): Promise<Therapeutic[]>;
  getPublications(query?: PublicationQuery): Promise<PublicationItem[]>;
  getSources(): Promise<DataSource[]>;
  getSummary(): Promise<DatasetSummary>;
  /** `null` when no synchronisation schedule exists (demo data). */
  getSyncStatus(): Promise<SyncStatus | null>;
}
