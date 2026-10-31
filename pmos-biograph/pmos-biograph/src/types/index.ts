/**
 * Domain model for PMOS / BIOGRAPH.
 *
 * These interfaces are the CONTRACT between the UI and the data layer. When the real
 * backend arrives, only `src/services/normalisers.ts` should need to change so that
 * API payloads are mapped into these shapes.
 */

export type EntityType =
  | 'gene'
  | 'protein'
  | 'hormone'
  | 'biomarker'
  | 'pathway'
  | 'therapeutic'
  | 'publication'
  | 'process';

export type SourceId =
  | 'ncbi-gene'
  | 'uniprot'
  | 'reactome'
  | 'gene-ontology'
  | 'pubchem'
  | 'open-targets'
  | 'pubmed';

/**
 * Where a record's identifier / statement comes from.
 *  - `project-document`: stated in the PMOS project progress document.
 *  - `unverified-demo`: illustrative demonstration content that has NOT yet been
 *    validated against the source database. Never treat as verified biology.
 */
export type Verification = 'project-document' | 'unverified-demo';

export interface SourceRef {
  source: SourceId;
  /** Accession in the source database, if known. */
  accession?: string;
  /** Only populated when the URL is derived from a verified identifier. */
  url?: string;
  verification: Verification;
}

export interface Annotation {
  label: string;
  value: string;
  verification: Verification;
}

export interface ChemicalInfo {
  formula?: string;
  molecularWeight?: string;
  pubchemCid?: string;
}

interface BaseEntity {
  id: string;
  type: EntityType;
  /** Display name (for publications this is the title). */
  name: string;
  /** Human-readable identifier, e.g. "NCBI Gene 1586" value. */
  primaryId: string;
  /** What kind of identifier `primaryId` is. */
  idLabel: string;
  aliases: string[];
  description: string;
  sources: SourceRef[];
  annotations: Annotation[];
  verification: Verification;
}

export interface Gene extends BaseEntity {
  type: 'gene';
  symbol: string;
  organism: string;
}
export interface Protein extends BaseEntity {
  type: 'protein';
  geneSymbol?: string;
}
export interface Hormone extends BaseEntity {
  type: 'hormone';
  chemicalClass?: string;
  chemical?: ChemicalInfo;
}
export interface Biomarker extends BaseEntity {
  type: 'biomarker';
  sampleContext?: string;
}
export interface Pathway extends BaseEntity {
  type: 'pathway';
  organism: string;
}
export interface Therapeutic extends BaseEntity {
  type: 'therapeutic';
  chemical?: ChemicalInfo;
  /** `null` = not yet curated. We never infer mechanism. */
  mechanism: string | null;
}
export interface Publication extends BaseEntity {
  type: 'publication';
  authors: string[] | null;
  year: number | null;
  journal: string | null;
  pmid: string | null;
  evidenceCategory: EvidenceCategory;
}
export interface BiologicalProcess extends BaseEntity {
  type: 'process';
}

export type Entity =
  | Gene
  | Protein
  | Hormone
  | Biomarker
  | Pathway
  | Therapeutic
  | Publication
  | BiologicalProcess;

export type RelationLabel =
  | 'encodes'
  | 'participates in'
  | 'associated with'
  | 'targets'
  | 'supported by';

export type RelationStatus = 'project-document' | 'demo-unvalidated';

/** A relationship is an *association record*, never a causal claim. */
export interface Relationship {
  id: string;
  source: string;
  target: string;
  label: RelationLabel;
  status: RelationStatus;
  note?: string;
}

export type EvidenceCategory =
  | 'literature-reference'
  | 'database-association'
  | 'curated-annotation';

export interface DataSource {
  id: SourceId;
  name: string;
  contributes: string;
  entityTypes: EntityType[];
  status: IntegrationStatus;
  url: string;
  /** ISO timestamp. `null` until a real sync exists. */
  lastSync: string | null;
  validationNote: string;
  /** Upstream release/version seen at the last check, when the source reports one. */
  version?: string;
  /** ISO timestamp of the last upstream version check. */
  lastChecked?: string;
}

/** State of the automatic weekly synchronisation. */
export interface SyncStatus {
  schedule: string;
  /** ISO timestamp of the next scheduled run. */
  nextRun: string;
  lastChecked: string | null;
  lastSynced: string | null;
  lastOutcome: string | null;
  lastReason: string | null;
}

export type IntegrationStatus = 'connected' | 'demo-data' | 'awaiting-integration';

export interface DatasetStatus {
  mode: 'demo' | 'live';
  label: string;
  backendConfigured: boolean;
  detail: string;
}

export interface SearchOptions {
  types?: EntityType[];
  sources?: SourceId[];
  limit?: number;
}

export interface SearchHit {
  entity: Entity;
  score: number;
  matchedOn: 'name' | 'alias' | 'identifier' | 'description';
}

export interface Neighbour {
  entity: Entity;
  relationship: Relationship;
  /** Direction relative to the queried entity. */
  direction: 'out' | 'in';
}

export interface GraphData {
  entities: Entity[];
  relationships: Relationship[];
}

export type SortKey = 'name' | 'type' | 'primaryId' | 'relationships';

export interface ListQuery {
  query?: string;
  types?: EntityType[];
  sources?: SourceId[];
  sortBy?: SortKey;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface ListItem {
  entity: Entity;
  relationshipCount: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PublicationQuery {
  query?: string;
  year?: number | 'unknown';
  entityId?: string;
  category?: EvidenceCategory;
}

export interface PublicationItem {
  publication: Publication;
  entities: Entity[];
}

export interface DatasetSummary {
  entityCounts: Record<EntityType, number>;
  relationshipCount: number;
  validatedRelationshipCount: number;
  unvalidatedRelationshipCount: number;
  unverifiedIdentifierCount: number;
}
