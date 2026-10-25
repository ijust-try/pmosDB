import {
  Activity,
  Dna,
  Droplets,
  FileText,
  Hexagon,
  Pill,
  Waypoints,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { EntityType, IntegrationStatus, RelationStatus, SourceId, Verification } from '../types';

export interface EntityMeta {
  label: string;
  plural: string;
  icon: LucideIcon;
  /** Solid colour for light surfaces */
  color: string;
  soft: string;
  /** Colour on the midnight graph canvas */
  graph: string;
  shape: 'ellipse' | 'hexagon' | 'diamond' | 'round-tag' | 'round-rectangle' | 'octagon' | 'rectangle' | 'barrel';
}

export const ENTITY_META: Record<EntityType, EntityMeta> = {
  gene: { label: 'Gene', plural: 'Genes', icon: Dna, color: '#1B7F7C', soft: '#DCEFEC', graph: '#43C6B6', shape: 'ellipse' },
  protein: { label: 'Protein', plural: 'Proteins', icon: Hexagon, color: '#6C5CE7', soft: '#E9E6FD', graph: '#A99BFF', shape: 'hexagon' },
  hormone: { label: 'Hormone', plural: 'Hormones', icon: Droplets, color: '#A8650C', soft: '#F7EAD3', graph: '#F0C27A', shape: 'diamond' },
  biomarker: { label: 'Biomarker', plural: 'Biomarkers', icon: Activity, color: '#B4455B', soft: '#F6E1E5', graph: '#F09AAE', shape: 'round-tag' },
  pathway: { label: 'Pathway', plural: 'Pathways', icon: Waypoints, color: '#5E8C6F', soft: '#E4EDE4', graph: '#9CC5A1', shape: 'round-rectangle' },
  therapeutic: { label: 'Therapeutic', plural: 'Therapeutics', icon: Pill, color: '#2F6FA8', soft: '#E0ECF7', graph: '#7DB8F0', shape: 'octagon' },
  publication: { label: 'Publication', plural: 'Publications', icon: FileText, color: '#5B6478', soft: '#ECEEF2', graph: '#A7B0C4', shape: 'rectangle' },
  process: { label: 'Biological process', plural: 'Biological processes', icon: Workflow, color: '#7A6A3F', soft: '#EFEADA', graph: '#D6C38F', shape: 'barrel' },
};

export const ENTITY_TYPES = Object.keys(ENTITY_META) as EntityType[];

export const SOURCE_NAMES: Record<SourceId, string> = {
  'ncbi-gene': 'NCBI Gene',
  uniprot: 'UniProt',
  reactome: 'Reactome',
  'gene-ontology': 'Gene Ontology',
  pubchem: 'PubChem',
  'open-targets': 'Open Targets',
  pubmed: 'PubMed',
};

export const SOURCE_IDS = Object.keys(SOURCE_NAMES) as SourceId[];

export const STATUS_META: Record<IntegrationStatus, { label: string; tone: string; dot: string }> = {
  connected: { label: 'Connected', tone: 'bg-sage-soft text-sage', dot: 'bg-sage' },
  'demo-data': { label: 'Demo data', tone: 'bg-amber-soft text-amber', dot: 'bg-amber' },
  'awaiting-integration': { label: 'Awaiting integration', tone: 'bg-sand-deep text-ink-mute', dot: 'bg-ink-faint' },
};

export const VERIFICATION_META: Record<Verification, { label: string; short: string; tone: string }> = {
  'project-document': {
    label: 'Stated in project document',
    short: 'Project document',
    tone: 'bg-teal-soft text-teal',
  },
  'unverified-demo': {
    label: 'Illustrative · identifier pending verification',
    short: 'Unverified demo',
    tone: 'bg-amber-soft text-amber',
  },
};

export const RELATION_STATUS_META: Record<RelationStatus, { label: string; tone: string }> = {
  'project-document': { label: 'From project document', tone: 'bg-teal-soft text-teal' },
  'demo-unvalidated': { label: 'Illustrative · not validated', tone: 'bg-amber-soft text-amber' },
};

export const EVIDENCE_LABELS = {
  'literature-reference': 'Literature reference',
  'database-association': 'Database association',
  'curated-annotation': 'Curated annotation',
} as const;

export const EVIDENCE_NOTES = {
  'literature-reference': 'A published study that addresses this entity. It is a pointer to the literature, not a verified finding.',
  'database-association': 'An association recorded in a database. Associations are not evidence of causation.',
  'curated-annotation': 'A manually curated annotation. Review the source for the supporting evidence.',
} as const;
