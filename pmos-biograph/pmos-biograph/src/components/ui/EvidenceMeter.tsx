import type { PcosAssociation } from '../../types';

/**
 * Open Targets association between a gene and PCOS: score 0-1 plus rank.
 * It measures strength of association evidence, never causation.
 */
export function EvidenceMeter({ association, className = '' }: { association: PcosAssociation; className?: string }) {
  const pct = Math.max(0, Math.min(1, association.score)) * 100;
  // Very small datatype scores are noise (e.g. a stray text-mined mention); list only the substantive ones.
  const meaningful = association.evidenceTypes.filter((t) => t.score >= 0.1);
  return (
    <div
      className={className}
      title="Association strength between this gene and PCOS from Open Targets (0 to 1). An association score, not evidence of causation."
    >
      <div className="flex items-baseline justify-between gap-3 text-[12px]">
        <span className="eyebrow">Open Targets PCOS association</span>
        <span className="font-mono font-semibold text-ink">
          {association.score.toFixed(2)}
          <span className="ml-2 font-normal text-ink-mute">
            rank {association.rank}
            {association.total ? ` of ${association.total}` : ''}
          </span>
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={association.score}
        aria-label="PCOS association score"
      >
        <div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
      </div>
      {meaningful.length > 0 && (
        <p className="mt-1.5 text-[11.5px] text-ink-mute">
          Evidence: {meaningful.map((t) => `${t.type.replace(/_/g, ' ')} ${t.score.toFixed(2)}`).join(' · ')}
        </p>
      )}
    </div>
  );
}
