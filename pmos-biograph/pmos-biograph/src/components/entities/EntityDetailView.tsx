import { ArrowLeft, ArrowRight, ExternalLink, Network } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { getEntityById, getEntityRelationships } from '../../services/repository';
import type { Entity, Neighbour } from '../../types';
import { ENTITY_META, ENTITY_TYPES, EVIDENCE_LABELS, EVIDENCE_NOTES, SOURCE_NAMES } from '../../utils/entityMeta';
import { EvidenceMeter } from '../ui/EvidenceMeter';
import { MiniGraph } from '../graph/MiniGraph';
import { RelationStatusBadge, SourceBadge, TypeBadge, TypeIcon, VerificationBadge } from '../ui/Badges';
import { EmptyState, ErrorState, LoadingRows } from '../ui/States';
import { TabPanel, Tabs } from '../ui/Tabs';

const NOT_CURATED = 'Not yet curated';
const NO_TARGET = 'No curated target in Open Targets';
const MUTED_VALUES = new Set([NOT_CURATED, NO_TARGET, 'Not recorded', 'Not mapped']);

function facts(e: Entity, neighbours: Neighbour[]): Array<{ label: string; value: string }> {
  switch (e.type) {
    case 'gene':
      return [
        { label: 'Gene symbol', value: e.symbol },
        { label: 'Organism', value: e.organism },
        ...(e.pcosAssociation
          ? [
              {
                label: 'PCOS association',
                value: `${e.pcosAssociation.score.toFixed(2)} (rank ${e.pcosAssociation.rank}${e.pcosAssociation.total ? ` of ${e.pcosAssociation.total}` : ''}, Open Targets)`,
              },
            ]
          : []),
      ];
    case 'protein':
      return [{ label: 'Encoded by', value: e.geneSymbol ?? NOT_CURATED }];
    case 'hormone':
      return [
        { label: 'Chemical class', value: e.chemicalClass ?? NOT_CURATED },
        { label: 'PubChem CID', value: e.chemical?.pubchemCid ?? 'Not mapped' },
      ];
    case 'biomarker':
      return [{ label: 'Sample context', value: e.sampleContext ?? NOT_CURATED }];
    case 'pathway':
      return [
        { label: 'Organism', value: e.organism },
        ...(e.pcosEvidence
          ? [
              {
                label: 'PCOS evidence',
                value: e.pcosEvidence.topGene
                  ? `${e.pcosEvidence.associatedGenes} of ${e.pcosEvidence.memberGenes} member genes associated; strongest ${e.pcosEvidence.topGene} (${e.pcosEvidence.topScore?.toFixed(2)})`
                  : `None of ${e.pcosEvidence.memberGenes} member genes has a PCOS association in Open Targets`,
              },
            ]
          : []),
      ];
    case 'therapeutic':
      return [
        { label: 'PubChem CID', value: e.chemical?.pubchemCid ?? 'Not mapped' },
        { label: 'Mechanism', value: e.mechanism ?? NOT_CURATED },
        {
          label: 'Biological target',
          value:
            neighbours
              .filter((n) => n.entity.type === 'gene' && n.relationship.label === 'targets')
              .map((n) => n.entity.name)
              .join(', ') || NO_TARGET,
        },
      ];
    case 'publication':
      return [
        { label: 'Authors', value: e.authors?.join(', ') ?? 'Not recorded' },
        { label: 'Year', value: e.year ? String(e.year) : 'Not recorded' },
        { label: 'Journal', value: e.journal ?? 'Not recorded' },
        { label: 'PMID', value: e.pmid ?? 'Not recorded' },
        { label: 'Evidence category', value: EVIDENCE_LABELS[e.evidenceCategory] },
      ];
    default:
      return [];
  }
}

function RelationRow({ n }: { n: Neighbour }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <TypeIcon type={n.entity.type} size={30} />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] text-ink-mute">
          {n.direction === 'in' ? '← ' : ''}
          {n.relationship.label}
          {n.direction === 'out' ? ' →' : ''}
        </p>
        <Link to={`/entity/${n.entity.id}`} className="block truncate text-sm font-bold text-ink hover:text-teal">
          {n.entity.name}
        </Link>
        {n.relationship.note ? <p className="mt-0.5 text-[12px] leading-relaxed text-ink-mute">{n.relationship.note}</p> : null}
      </div>
      <RelationStatusBadge status={n.relationship.status} />
    </li>
  );
}

export function EntityDetailView({ entityId }: { entityId: string }) {
  const [tab, setTab] = useState('overview');
  const entityState = useAsync(() => getEntityById(entityId), [entityId]);
  const relState = useAsync(() => getEntityRelationships(entityId), [entityId]);

  if (entityState.error) return <ErrorState error={entityState.error} onRetry={entityState.reload} />;
  if (entityState.loading && !entityState.data) return <LoadingRows rows={8} />;
  const entity = entityState.data;
  if (!entity) {
    return (
      <EmptyState
        title="Entity not found"
        body={`No record with id “${entityId}” exists in the current dataset.`}
        action={
          <Link to="/explore" className="btn-primary">
            Back to catalogue
          </Link>
        }
      />
    );
  }

  const neighbours = relState.data ?? [];
  const meta = ENTITY_META[entity.type];
  const grouped = ENTITY_TYPES.map((t) => ({ type: t, items: neighbours.filter((n) => n.entity.type === t) })).filter((g) => g.items.length);
  const publications = neighbours.filter((n) => n.entity.type === 'publication');
  const labelCounts = neighbours.reduce<Record<string, number>>((acc, n) => {
    acc[n.relationship.label] = (acc[n.relationship.label] ?? 0) + 1;
    return acc;
  }, {});
  const validated = neighbours.filter((n) => n.relationship.status === 'project-document').length;

  return (
    <div>
      <Link to="/explore" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-mute hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> Back to catalogue
      </Link>

      {/* Dossier header */}
      <header className="panel grid-bg relative overflow-hidden p-6 md:p-8">
        <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: meta.color }} aria-hidden />
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={entity.type} />
              <VerificationBadge value={entity.verification} />
            </div>
            <h1 className="mt-3 text-[30px] font-extrabold leading-tight tracking-tight text-ink md:text-[34px]">{entity.name}</h1>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm text-ink-soft">
              <span className="eyebrow">{entity.idLabel}</span>
              <span className="font-mono text-[14px] font-medium text-ink">{entity.primaryId}</span>
            </p>
            {entity.aliases.length ? (
              <p className="mt-2 text-[13px] text-ink-mute">
                <span className="font-semibold text-ink-soft">Aliases:</span> {entity.aliases.join(' · ')}
              </p>
            ) : null}
            {entity.type === 'gene' && entity.pcosAssociation ? (
              <EvidenceMeter association={entity.pcosAssociation} className="mt-4 max-w-md" />
            ) : null}
          </div>
          <Link to={`/graph?focus=${entity.id}`} className="btn-primary">
            <Network size={15} aria-hidden /> Explore in BioGraph
          </Link>
        </div>
      </header>

      <div className="mt-6">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'relationships', label: 'Relationships', count: neighbours.length },
            { id: 'evidence', label: 'Evidence', count: publications.length },
            { id: 'sources', label: 'Sources' },
          ]}
        />
      </div>

      <div className="mt-6">
        <TabPanel id="overview" active={tab}>
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="space-y-6">
              <section className="panel p-5">
                <p className="eyebrow">Biological description</p>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{entity.description}</p>
              </section>

              {facts(entity, neighbours).length ? (
                <section className="panel overflow-hidden">
                  <p className="eyebrow border-b border-line px-5 py-3">Record fields</p>
                  <dl className="divide-y divide-line/70">
                    {facts(entity, neighbours).map((f) => (
                      <div key={f.label} className="grid grid-cols-[150px_1fr] gap-3 px-5 py-2.5 text-sm">
                        <dt className="text-ink-mute">{f.label}</dt>
                        <dd className={`font-semibold ${MUTED_VALUES.has(f.value) ? 'font-normal italic text-ink-faint' : 'text-ink'}`}>
                          {f.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}

              <section className="panel overflow-hidden">
                <p className="eyebrow border-b border-line px-5 py-3">Functional annotations</p>
                {entity.annotations.length ? (
                  <ul className="divide-y divide-line/70">
                    {entity.annotations.map((a, i) => (
                      <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                        <div>
                          <p className="text-[12px] text-ink-mute">{a.label}</p>
                          <p className="font-semibold text-ink">{a.value}</p>
                        </div>
                        <VerificationBadge value={a.verification} short />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-4 text-sm text-ink-mute">No functional annotations imported yet.</p>
                )}
              </section>
            </div>

            <div className="space-y-6">
              <section>
                <p className="eyebrow mb-2">Neighbourhood</p>
                <MiniGraph focusId={entity.id} depth={1} className="h-72" />
                <p className="mt-2 text-[11.5px] text-ink-mute">Direct connections only. Click a node to open its dossier.</p>
              </section>

              <section className="panel p-5">
                <p className="eyebrow">Relationship summary</p>
                {neighbours.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-mute">No relationships recorded.</p>
                ) : (
                  <>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {Object.entries(labelCounts).map(([label, count]) => (
                        <span key={label} className="rounded-md bg-sand px-2 py-1 font-mono text-[11px] text-ink-soft">
                          {label} · {count}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {grouped.map((g) => (
                        <span
                          key={g.type}
                          className="rounded-md px-2 py-1 text-[11px] font-semibold"
                          style={{ background: ENTITY_META[g.type].soft, color: ENTITY_META[g.type].color }}
                        >
                          {ENTITY_META[g.type].plural} · {g.items.length}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-[12px] text-ink-mute">
                      {validated} of {neighbours.length} link{neighbours.length === 1 ? '' : 's'} stated in the project document; the rest are illustrative.
                    </p>
                  </>
                )}
              </section>
            </div>
          </div>
        </TabPanel>

        <TabPanel id="relationships" active={tab}>
          {relState.error ? (
            <ErrorState error={relState.error} onRetry={relState.reload} />
          ) : relState.loading && !relState.data ? (
            <LoadingRows />
          ) : grouped.length === 0 ? (
            <div className="panel">
              <EmptyState title="No relationships yet" body="This record has no connections in the demonstration dataset." />
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map((g) => (
                <section key={g.type} className="panel overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-line bg-paper px-4 py-2.5">
                    <TypeBadge type={g.type} />
                    <span className="eyebrow">{ENTITY_META[g.type].plural}</span>
                  </div>
                  <ul className="divide-y divide-line/70">
                    {g.items.map((n) => (
                      <RelationRow key={n.relationship.id} n={n} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </TabPanel>

        <TabPanel id="evidence" active={tab}>
          <div className="space-y-5">
            <div className="rounded-lg border border-line bg-sand/60 px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
              A relationship in this knowledge base records an <strong>association</strong> between two entities. It is not evidence of
              causation, and nothing here is a clinical recommendation.
            </div>

            {entity.type === 'publication' ? (
              <section className="panel p-5">
                <p className="eyebrow">Evidence category</p>
                <p className="mt-1 text-base font-bold text-ink">{EVIDENCE_LABELS[entity.evidenceCategory]}</p>
                <p className="mt-1 text-sm text-ink-mute">{EVIDENCE_NOTES[entity.evidenceCategory]}</p>
                <p className="eyebrow mt-5">Associated entities</p>
                <ul className="mt-2 space-y-1.5">
                  {neighbours.map((n) => (
                    <li key={n.relationship.id}>
                      <Link to={`/entity/${n.entity.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-ink hover:text-teal">
                        <TypeIcon type={n.entity.type} size={22} /> {n.entity.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : publications.length ? (
              <section className="panel overflow-hidden">
                <p className="eyebrow border-b border-line px-5 py-3">Supporting publications</p>
                <ul className="divide-y divide-line/70">
                  {publications.map((n) => (
                    <li key={n.relationship.id} className="px-5 py-4">
                      <Link to={`/entity/${n.entity.id}`} className="text-sm font-bold leading-snug text-ink hover:text-teal">
                        {n.entity.name}
                      </Link>
                      <p className="mt-1 font-mono text-[11.5px] text-ink-mute">{n.entity.primaryId}</p>
                      {n.relationship.note ? <p className="mt-1.5 text-[12.5px] text-ink-mute">{n.relationship.note}</p> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <div className="panel">
                <EmptyState
                  title="No linked publications"
                  body="Publication evidence will appear here once PubMed records are imported and linked to this entity."
                />
              </div>
            )}
          </div>
        </TabPanel>

        <TabPanel id="sources" active={tab}>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="panel overflow-hidden">
              <p className="eyebrow border-b border-line px-5 py-3">Source databases</p>
              {entity.sources.length ? (
                <ul className="divide-y divide-line/70">
                  {entity.sources.map((s, i) => (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                      <div>
                        <p className="text-sm font-bold text-ink">{SOURCE_NAMES[s.source]}</p>
                        <p className="font-mono text-[12px] text-ink-mute">{s.accession ?? 'No accession mapped'}</p>
                      </div>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer" className="btn-ghost !py-1 text-[12px]">
                          Open record <ExternalLink size={12} aria-hidden />
                        </a>
                      ) : (
                        <span className="text-[11.5px] text-ink-faint">No verified URL</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-4 text-sm text-ink-mute">No source records have been mapped for this entity yet.</p>
              )}
              <div className="flex flex-wrap gap-1.5 border-t border-line px-5 py-3">
                {entity.sources.map((s, i) => (
                  <SourceBadge key={i} source={{ ...s, url: undefined }} />
                ))}
              </div>
            </section>

            <section className="panel overflow-hidden">
              <p className="eyebrow border-b border-line px-5 py-3">Origin of each record</p>
              <ul className="divide-y divide-line/70 text-sm">
                <li className="flex items-center justify-between gap-2 px-5 py-3">
                  <span>
                    <span className="block text-[12px] text-ink-mute">Primary identifier</span>
                    <span className="font-mono text-[12.5px] font-medium">{entity.primaryId}</span>
                  </span>
                  <VerificationBadge value={entity.verification} short />
                </li>
                {entity.annotations.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 px-5 py-3">
                    <span>
                      <span className="block text-[12px] text-ink-mute">{a.label}</span>
                      <span className="font-semibold">{a.value}</span>
                    </span>
                    <VerificationBadge value={a.verification} short />
                  </li>
                ))}
                {neighbours.map((n) => (
                  <li key={n.relationship.id} className="flex items-center justify-between gap-2 px-5 py-3">
                    <span>
                      <span className="block font-mono text-[11px] text-ink-mute">
                        {n.direction === 'in' ? '← ' : ''}
                        {n.relationship.label}
                        {n.direction === 'out' ? ' →' : ''}
                      </span>
                      <span className="font-semibold">{n.entity.name}</span>
                    </span>
                    <RelationStatusBadge status={n.relationship.status} />
                  </li>
                ))}
              </ul>
              <p className="border-t border-line bg-paper px-5 py-3 text-[11.5px] leading-relaxed text-ink-mute">
                Identifiers marked “unverified demo” must be validated against the source database during backend integration.
              </p>
            </section>
          </div>
        </TabPanel>
      </div>

      {neighbours.length > 0 ? (
        <div className="mt-8 flex items-center justify-end">
          <Link to={`/graph?focus=${entity.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal hover:underline">
            Continue exploring connections <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
