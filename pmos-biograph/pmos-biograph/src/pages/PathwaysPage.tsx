import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CatalogList } from '../components/entities/CatalogList';
import { EntityChips } from '../components/entities/EntityChips';
import { MiniGraph } from '../components/graph/MiniGraph';
import { PageContainer } from '../components/layout/AppShell';
import { SourceBadge, VerificationBadge } from '../components/ui/Badges';
import { DemoNotice, PageHeader } from '../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingRows } from '../components/ui/States';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { getDatasetStatus, getPathwayDetail, getPathways, searchEntities } from '../services/repository';
import type { Pathway } from '../types';

function PathwayDetailPanel({ id }: { id: string }) {
  const state = useAsync(() => getPathwayDetail(id), [id]);
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (state.loading && !state.data) return <LoadingRows rows={6} />;
  const d = state.data;
  if (!d) return <EmptyState title="Pathway not found" />;
  const { pathway } = d;

  return (
    <div className="space-y-5">
      <header className="panel grid-bg p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">Pathway</span>
          <VerificationBadge value={pathway.verification} short />
        </div>
        <h2 className="mt-2 text-[28px] font-extrabold tracking-tight text-ink">{pathway.name}</h2>
        <p className="mt-1 font-mono text-[12.5px] text-ink-mute">
          {pathway.idLabel}: {pathway.primaryId}
        </p>
        <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-ink-soft">{pathway.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {pathway.sources.map((s, i) => (
            <SourceBadge key={i} source={s} />
          ))}
          <Link to={`/entity/${pathway.id}`} className="inline-flex items-center gap-1 text-[12.5px] font-bold text-teal hover:underline">
            Full dossier <ArrowRight size={13} aria-hidden />
          </Link>
        </div>
      </header>

      <section>
        <p className="eyebrow mb-2">Simplified relationship diagram</p>
        <MiniGraph focusId={pathway.id} depth={1} interactive className="h-[430px]" />
        <p className="mt-2 text-[12px] leading-relaxed text-ink-mute">
          This diagram summarises entities connected to the pathway in the knowledge base. It is <strong>not</strong> a reaction sequence
          and is not an experimentally validated pathway map. Dashed edges are illustrative.
        </p>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="panel p-5">
          <p className="eyebrow mb-3">Associated genes</p>
          <EntityChips entities={d.genes} empty="No member genes are mapped to this pathway." />
        </section>
        <section className="panel p-5">
          <p className="eyebrow mb-3">Associated proteins</p>
          <EntityChips entities={d.proteins} empty="No member proteins are mapped to this pathway." />
        </section>
        <section className="panel p-5">
          <p className="eyebrow mb-3">Related biological processes</p>
          <EntityChips entities={d.processes} empty="None of this pathway's member genes has a condition-level association in Open Targets." />
          {d.processes.length > 0 && (
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-mute">
              Conditions associated (Open Targets) with the pathway's member genes. An association record, not a causal claim.
            </p>
          )}
        </section>
        <section className="panel p-5">
          <p className="eyebrow mb-3">Related hormones</p>
          <EntityChips entities={d.hormones} empty="No hormones are associated with this pathway's member proteins." />
        </section>
        <section className="panel p-5">
          <p className="eyebrow mb-3">Connected therapeutics</p>
          <EntityChips entities={d.therapeutics} empty="No compound in the data has a curated target among this pathway's member genes." />
          {d.therapeutics.length > 0 && (
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-mute">
              Compounds whose curated target (Open Targets / ChEMBL) is a member gene of this pathway.
            </p>
          )}
        </section>
        <section className="panel p-5">
          <p className="eyebrow mb-3">Publications</p>
          <EntityChips entities={d.publications} empty="No publications are linked to this pathway's member genes." />
          {d.publications.length > 0 && (
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-mute">Literature supporting the pathway's member genes.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export default function PathwaysPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const dq = useDebounce(q.trim(), 160);
  const datasetStatus = useAsync(() => getDatasetStatus(), []);
  const isLive = datasetStatus.data?.mode === 'live';

  const list = useAsync<Pathway[]>(async () => {
    if (!dq) return getPathways();
    const hits = await searchEntities(dq, { types: ['pathway'] });
    return hits.map((h) => h.entity as Pathway);
  }, [dq]);

  const items = list.data ?? [];
  const selected = params.get('p') ?? items[0]?.id ?? null;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Biological pathways"
        title="Pathways"
        description="Browse pathways with their associated genes, proteins, processes and hormones. Each member links back to its entity dossier."
      />
      <div className="mb-6">
        {isLive ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-sage/25 bg-sage-soft/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-sage">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sage" aria-hidden />
            <p>
              Pathway identifiers and membership are real Reactome records. The relationship diagram below is still not a reaction
              sequence — it summarises connected entities, not reaction order.
            </p>
          </div>
        ) : (
          <DemoNotice>
            Pathway membership shown here is illustrative. Reaction order and pathway identifiers will be imported from Reactome during
            backend integration.
          </DemoNotice>
        )}
      </div>
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <CatalogList
            items={items}
            loading={list.loading}
            selectedId={selected}
            onSelect={(id) => setParams({ p: id })}
            query={q}
            onQuery={setQ}
            placeholder="Search pathways…"
            label="Pathway catalogue"
          />
          <div>{selected ? <PathwayDetailPanel id={selected} /> : <div className="panel"><EmptyState title="Select a pathway" /></div>}</div>
        </div>
      )}
    </PageContainer>
  );
}
