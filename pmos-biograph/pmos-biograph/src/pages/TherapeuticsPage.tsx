import { ArrowRight, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CatalogList } from '../components/entities/CatalogList';
import { EntityChips } from '../components/entities/EntityChips';
import { PageContainer } from '../components/layout/AppShell';
import { SourceBadge, VerificationBadge } from '../components/ui/Badges';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingRows } from '../components/ui/States';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { getTherapeuticDetail, getTherapeutics, searchEntities } from '../services/repository';
import type { Therapeutic } from '../types';

const NOT_CURATED = 'Not yet curated';

function TherapeuticDetailPanel({ id }: { id: string }) {
  const state = useAsync(() => getTherapeuticDetail(id), [id]);
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (state.loading && !state.data) return <LoadingRows rows={6} />;
  const d = state.data;
  if (!d) return <EmptyState title="Compound not found" />;
  const t = d.therapeutic;
  const chem = t.annotations.filter((a) => /formula|weight/i.test(a.label));

  return (
    <div className="space-y-5">
      <header className="panel grid-bg p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">Therapeutic compound</span>
          <VerificationBadge value={t.verification} short />
        </div>
        <h2 className="mt-2 text-[28px] font-extrabold tracking-tight text-ink">{t.name}</h2>
        <p className="mt-1 font-mono text-[12.5px] text-ink-mute">
          {t.idLabel}: {t.primaryId}
          {t.aliases.length ? ` · ${t.aliases.join(', ')}` : ''}
        </p>
        <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-ink-soft">{t.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {t.sources.map((s, i) => (
            <SourceBadge key={i} source={s} />
          ))}
          <Link to={`/entity/${t.id}`} className="inline-flex items-center gap-1 text-[12.5px] font-bold text-teal hover:underline">
            Full dossier <ArrowRight size={13} aria-hidden />
          </Link>
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="panel overflow-hidden">
          <p className="eyebrow border-b border-line px-5 py-3">Chemical information</p>
          <dl className="divide-y divide-line/70 text-sm">
            <div className="grid grid-cols-[130px_1fr] gap-3 px-5 py-2.5">
              <dt className="text-ink-mute">PubChem CID</dt>
              <dd className="font-mono font-medium">{t.chemical?.pubchemCid ?? 'Not mapped'}</dd>
            </div>
            {chem.map((a) => (
              <div key={a.label} className="grid grid-cols-[130px_1fr] items-center gap-3 px-5 py-2.5">
                <dt className="text-ink-mute">{a.label}</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-medium">{a.value}</span>
                  <VerificationBadge value={a.verification} short />
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="panel overflow-hidden">
          <p className="eyebrow border-b border-line px-5 py-3">Mechanism &amp; target</p>
          <dl className="divide-y divide-line/70 text-sm">
            <div className="grid grid-cols-[130px_1fr] gap-3 px-5 py-2.5">
              <dt className="text-ink-mute">Mechanism</dt>
              <dd className={t.mechanism ? 'font-semibold' : 'italic text-ink-faint'}>{t.mechanism ?? NOT_CURATED}</dd>
            </div>
            <div className="grid grid-cols-[130px_1fr] gap-3 px-5 py-2.5">
              <dt className="text-ink-mute">Biological target</dt>
              <dd className="italic text-ink-faint">{NOT_CURATED}</dd>
            </div>
          </dl>
          <p className="border-t border-line bg-paper px-5 py-3 text-[11.5px] leading-relaxed text-ink-mute">
            Mechanism and target are shown only when supported by imported data. None is inferred here.
          </p>
        </section>

        <section className="panel p-5">
          <p className="eyebrow mb-3">Associated genes</p>
          <EntityChips entities={d.genes} empty="No genes linked yet." />
        </section>
        <section className="panel p-5">
          <p className="eyebrow mb-3">Associated pathways</p>
          <EntityChips entities={d.pathways} empty="No pathways linked yet." />
        </section>
        <section className="panel p-5">
          <p className="eyebrow mb-3">Biological context</p>
          <EntityChips
            entities={d.neighbours.filter((n) => n.entity.type === 'process').map((n) => n.entity)}
            empty="No biological context linked yet."
          />
        </section>
        <section className="panel p-5">
          <p className="eyebrow mb-3">Publications</p>
          <EntityChips entities={d.publications} empty="No publications linked yet." />
        </section>
      </div>
    </div>
  );
}

export default function TherapeuticsPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const dq = useDebounce(q.trim(), 160);
  const list = useAsync<Therapeutic[]>(async () => {
    if (!dq) return getTherapeutics();
    const hits = await searchEntities(dq, { types: ['therapeutic'] });
    return hits.map((h) => h.entity as Therapeutic);
  }, [dq]);
  const items = list.data ?? [];
  const selected = params.get('t') ?? items[0]?.id ?? null;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Compounds"
        title="Therapeutics"
        description="Chemical and biological information for therapeutic compounds, with source provenance."
      />
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-line bg-sand/60 px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
        <ShieldAlert size={17} className="mt-0.5 shrink-0 text-ink-mute" aria-hidden />
        <p>
          This is a <strong>research information interface</strong>, not a clinical decision-support system. It contains no treatment
          recommendations, dosing information, or claims of efficacy for PMOS.
        </p>
      </div>
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <CatalogList
            items={items}
            loading={list.loading}
            selectedId={selected}
            onSelect={(id) => setParams({ t: id })}
            query={q}
            onQuery={setQ}
            placeholder="Search compounds…"
            label="Therapeutics catalogue"
          />
          <div>{selected ? <TherapeuticDetailPanel id={selected} /> : <div className="panel"><EmptyState title="Select a compound" /></div>}</div>
        </div>
      )}
    </PageContainer>
  );
}
