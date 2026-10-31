import type { Entity, Gene, Pathway, PathwayEvidence } from '../types';

/** Open Targets PCOS association score (0-1) for a gene, if known. */
export const pcosScore = (e: Entity): number | null => (e.type === 'gene' ? (e.pcosAssociation?.score ?? null) : null);

/** Genes with the strongest PCOS association first; entities without a score come last. */
export function sortByEvidence<T extends Entity>(entities: T[]): T[] {
  return [...entities].sort((a, b) => (pcosScore(b) ?? -1) - (pcosScore(a) ?? -1) || a.name.localeCompare(b.name));
}

/** Short chip label: the score, e.g. "0.60". */
export const evidenceBadge = (e: Entity): string | null => {
  const s = pcosScore(e);
  return s === null ? null : s.toFixed(2);
};

export const pathwayEvidence = (p: Pathway): PathwayEvidence | null => p.pcosEvidence ?? null;

/** Pathways ranked by their strongest PCOS-associated member gene, then by how many such genes they have. */
export function sortPathwaysByEvidence(pathways: Pathway[]): Pathway[] {
  const key = (p: Pathway) => [p.pcosEvidence?.topScore ?? -1, p.pcosEvidence?.associatedGenes ?? 0] as const;
  return [...pathways].sort((a, b) => {
    const [ta, ca] = key(a);
    const [tb, cb] = key(b);
    return tb - ta || cb - ca || a.name.localeCompare(b.name);
  });
}

export const isGene = (e: Entity): e is Gene => e.type === 'gene';
