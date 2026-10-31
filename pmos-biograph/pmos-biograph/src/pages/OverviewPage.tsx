import { motion } from 'framer-motion';
import { ArrowRight, Network } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EntityTypeChart } from '../components/charts/EntityTypeChart';
import { PageContainer } from '../components/layout/AppShell';
import { MiniGraph } from '../components/graph/MiniGraph';
import { ProvenanceChart } from '../components/charts/ProvenanceChart';
import { DemoNotice, SectionTitle } from '../components/ui/PageHeader';
import { StatusPill, TypeBadge, TypeIcon, VerificationBadge } from '../components/ui/Badges';
import { AsyncBoundary, LoadingRows } from '../components/ui/States';
import { useAsync } from '../hooks/useAsync';
import {
  getDataSourceStatus,
  getDatasetStatus,
  getDatasetSummary,
  getFeaturedEntities,
  getDefaultGraphFocus,
} from '../services/repository';
import type { EntityType } from '../types';
import { ENTITY_META } from '../utils/entityMeta';

const METRICS: Array<{ label: string; type: EntityType }> = [
  { label: 'Genes', type: 'gene' },
  { label: 'Proteins', type: 'protein' },
  { label: 'Pathways', type: 'pathway' },
  { label: 'Biomarkers', type: 'biomarker' },
  { label: 'Therapeutics', type: 'therapeutic' },
  { label: 'Publications', type: 'publication' },
];

export default function OverviewPage() {
  const summary = useAsync(() => getDatasetSummary(), []);
  const featured = useAsync(() => getFeaturedEntities(), []);
  const sources = useAsync(() => getDataSourceStatus(), []);
  const datasetStatus = useAsync(() => getDatasetStatus(), []);
  const isLive = datasetStatus.data?.mode === 'live';

  return (
    <PageContainer>
      {/* Intro */}
      <section className="grid items-end gap-8 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <p className="eyebrow">PMOS Biological Knowledge Base</p>
          <h1 className="mt-3 text-[40px] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink md:text-[52px]">
            Explore the biology
            <br />
            behind <span className="text-teal">PMOS</span>.
          </h1>
          <p className="mt-5 max-w-xl text-[16.5px] leading-relaxed text-ink-soft">
            A connected knowledge base for discovering relationships across genes, proteins, hormones, pathways, biomarkers, and
            therapeutics.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/graph" className="btn-primary !px-4 !py-2.5">
              <Network size={16} aria-hidden /> Open BioGraph
            </Link>
            <Link to="/explore" className="btn-ghost !px-4 !py-2.5">
              Browse the catalogue <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
        </div>
        <div className="space-y-3">
          {isLive ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-sage/25 bg-sage-soft/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-sage">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sage" aria-hidden />
              <p>
                <strong>Live data.</strong> Records below are built from real NCBI, UniProt, Reactome, PubChem, PubMed and Open Targets
                records.
              </p>
            </div>
          ) : (
            <DemoNotice>
              <strong>Demonstration dataset.</strong> Records below are illustrative until the backend and relational database are connected.
              They are not verified biological statistics.
            </DemoNotice>
          )}
          <p className="text-[13px] leading-relaxed text-ink-mute">
            Moving from an entity to its connected relationships and supporting evidence is the core workflow: start from a gene such as
            CYP17A1 and follow it to its protein, pathway, and literature.
          </p>
        </div>
      </section>

      {/* Metrics strip */}
      <section aria-label="Dataset counts" className="mt-10">
        <div className="panel grid grid-cols-2 divide-x divide-y divide-line overflow-hidden sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
          {METRICS.map((m) => {
            const meta = ENTITY_META[m.type];
            return (
              <Link
                key={m.type}
                to={`/explore?type=${m.type}`}
                className="group relative px-5 py-4 transition-colors hover:bg-sand/60"
              >
                <span className="absolute left-0 top-0 h-full w-[3px] opacity-0 transition-opacity group-hover:opacity-100" style={{ background: meta.color }} aria-hidden />
                <p className="eyebrow">{m.label}</p>
                <p className="mt-1.5 font-mono text-[32px] font-medium leading-none text-ink">
                  {summary.data ? summary.data.entityCounts[m.type] : <span className="text-ink-faint">–</span>}
                </p>
              </Link>
            );
          })}
        </div>
        <p className="mt-2 text-[11.5px] text-ink-mute">
          {isLive
            ? 'Counts reflect the current relational database. The knowledge base continues to grow as more entities are curated.'
            : 'Counts reflect the demonstration dataset only. They are not totals for the eventual knowledge base.'}
        </p>
      </section>

      {/* BioGraph feature */}
      <section className="mt-12 overflow-hidden rounded-2xl bg-midnight text-slate-200">
        <div className="grid lg:grid-cols-[360px_1fr]">
          <div className="flex flex-col justify-between p-7">
            <div>
              <p className="eyebrow !text-teal-bright">Signature feature</p>
              <h2 className="mt-2 text-[26px] font-extrabold leading-tight tracking-tight text-white">BioGraph</h2>
              <p className="mt-3 text-[14px] leading-relaxed text-slate-400">
                Start from CYP17A1 and walk outward: gene to protein, protein to pathway, pathway to hormones and processes. Every
                edge is labelled, and every illustrative association is marked as such.
              </p>
              <ul className="mt-5 space-y-2 text-[13px] text-slate-300">
                {['Pan, zoom, drag and select', 'Filter by entity category', 'Expand any neighbourhood', 'Open a full dossier from any node'].map((t) => (
                  <li key={t} className="flex items-center gap-2.5">
                    <span className="h-1 w-1 rounded-full bg-teal-bright" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <Link to="/graph" className="btn mt-7 border-teal-bright bg-teal-bright !text-midnight hover:bg-white">
              Launch BioGraph <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
          <MiniGraph focusId={getDefaultGraphFocus()} depth={3} interactive className="h-[420px] !rounded-none" />
        </div>
      </section>

      {/* Featured */}
      <section className="mt-14">
        <SectionTitle eyebrow="Featured records" title="Start from a representative entity" />
        <AsyncBoundary state={featured} loading={<LoadingRows rows={4} />}>
          {(items) => {
            const [lead, ...rest] = items;
            return (
              <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
                {lead ? (
                  <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
                    <Link to={`/entity/${lead.id}`} className="panel group relative block h-full overflow-hidden p-6 hover:shadow-lift">
                      <div className="grid-bg absolute inset-0 opacity-60" aria-hidden />
                      <div className="relative">
                        <div className="flex items-center gap-2">
                          <TypeBadge type={lead.type} />
                          <VerificationBadge value={lead.verification} short />
                        </div>
                        <h3 className="mt-4 text-[34px] font-extrabold tracking-tight text-ink">{lead.name}</h3>
                        <p className="mt-1 font-mono text-[12.5px] text-ink-mute">
                          {lead.idLabel} {lead.primaryId}
                        </p>
                        <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-ink-soft">{lead.description}</p>
                        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-teal">
                          Open dossier <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                ) : null}
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {rest.map((e) => (
                    <li key={e.id}>
                      <Link to={`/entity/${e.id}`} className="panel flex items-center gap-3.5 p-3.5 transition-shadow hover:shadow-lift">
                        <TypeIcon type={e.type} size={38} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-ink">{e.name}</span>
                          <span className="block truncate text-[12px] text-ink-mute">
                            {ENTITY_META[e.type].label} · {e.primaryId}
                          </span>
                        </span>
                        <ArrowRight size={15} className="text-ink-faint" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          }}
        </AsyncBoundary>
      </section>

      {/* Composition + sources */}
      <section className="mt-14 grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <div className="space-y-6">
          <div className="panel p-5">
            <SectionTitle eyebrow="Dataset composition" title="Records by entity type" />
            <AsyncBoundary state={summary} loading={<LoadingRows rows={4} />}>
              {(s) => <EntityTypeChart summary={s} />}
            </AsyncBoundary>
          </div>
          <div className="panel p-5">
            <SectionTitle eyebrow="Provenance" title="Relationship status" />
            <AsyncBoundary state={summary} loading={<LoadingRows rows={2} />}>
              {(s) => (
                <>
                  <ProvenanceChart summary={s} />
                  <p className="mt-3 text-[12px] leading-relaxed text-ink-mute">
                    Only relationships stated in the project document are treated as established links. All others are illustrative and
                    awaiting validation against source databases.
                  </p>
                </>
              )}
            </AsyncBoundary>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <SectionTitle eyebrow="Data sources" title="Integration status" />
            <AsyncBoundary state={sources} loading={null}>
              {(s) => (
                <p className="-mt-2 text-[12.5px] text-ink-mute">
                  {s.filter((x) => x.status === 'connected').length} connected ·{' '}
                  {s.filter((x) => x.status === 'demo-data').length} represented by demo data ·{' '}
                  {s.filter((x) => x.status === 'awaiting-integration').length} awaiting integration
                </p>
              )}
            </AsyncBoundary>
          </div>
          <AsyncBoundary state={sources}>
            {(list) => (
              <ul className="divide-y divide-line/70">
                {list.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-ink">{s.name}</p>
                      <p className="truncate text-[12px] text-ink-mute">{s.contributes}</p>
                    </div>
                    <StatusPill status={s.status} />
                  </li>
                ))}
              </ul>
            )}
          </AsyncBoundary>
          <Link to="/sources" className="flex items-center justify-between border-t border-line bg-paper px-5 py-3 text-[13px] font-semibold text-teal hover:underline">
            View source details <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      </section>
    </PageContainer>
  );
}
