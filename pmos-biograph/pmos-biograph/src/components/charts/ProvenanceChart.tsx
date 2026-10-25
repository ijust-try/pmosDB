import type { DatasetSummary } from '../../types';

/** Simple proportion bar: how many relationships are stated in the project document vs illustrative. */
export function ProvenanceChart({ summary }: { summary: DatasetSummary }) {
  const total = summary.relationshipCount || 1;
  const doc = summary.validatedRelationshipCount;
  const demo = summary.unvalidatedRelationshipCount;
  return (
    <div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-sand-deep"
        role="img"
        aria-label={`${doc} relationships from the project document, ${demo} illustrative`}
      >
        <div className="bg-teal" style={{ width: `${(doc / total) * 100}%` }} />
        <div className="bg-amber/70" style={{ width: `${(demo / total) * 100}%` }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="flex items-center gap-1.5 text-[12px] text-ink-mute">
            <span className="h-2 w-2 rounded-sm bg-teal" aria-hidden /> From project document
          </dt>
          <dd className="font-mono text-lg font-medium text-ink">{doc}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-[12px] text-ink-mute">
            <span className="h-2 w-2 rounded-sm bg-amber/70" aria-hidden /> Illustrative
          </dt>
          <dd className="font-mono text-lg font-medium text-ink">{demo}</dd>
        </div>
      </dl>
    </div>
  );
}
