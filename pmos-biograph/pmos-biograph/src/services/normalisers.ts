/**
 * RESPONSE NORMALISATION: the one place where backend payloads become UI types.
 *
 * When the database/API team delivers real responses, adapt these functions. The rest
 * of the application only ever sees the types in `src/types`.
 * Today they assume the API already returns payloads close to the UI model.
 */
import type {
  DataSource,
  DatasetSummary,
  Entity,
  GraphData,
  ListItem,
  Neighbour,
  Page,
  PublicationItem,
  Relationship,
  SearchHit,
} from '../types';

export const normaliseEntity = (raw: unknown): Entity => raw as Entity;
export const normaliseRelationship = (raw: unknown): Relationship => raw as Relationship;
export const normaliseNeighbour = (raw: unknown): Neighbour => raw as Neighbour;
export const normaliseSearchHit = (raw: unknown): SearchHit => raw as SearchHit;
export const normaliseListPage = (raw: unknown): Page<ListItem> => raw as Page<ListItem>;
export const normaliseGraph = (raw: unknown): GraphData => raw as GraphData;
export const normalisePublicationItem = (raw: unknown): PublicationItem => raw as PublicationItem;
export const normaliseSource = (raw: unknown): DataSource => raw as DataSource;
export const normaliseSummary = (raw: unknown): DatasetSummary => raw as DatasetSummary;
