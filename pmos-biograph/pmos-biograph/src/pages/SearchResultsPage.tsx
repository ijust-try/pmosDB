import { Link, useSearchParams } from 'react-router-dom';
import { PageContainer } from '../components/layout/AppShell';
import { TypeIcon, VerificationBadge } from '../components/ui/Badges';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingRows } from '../components/ui/States';
import { useAsync } from '../hooks/useAsync';
import { getDatasetStatus, searchEntities } from '../services/repository';
import { ENTITY_META, ENTITY_TYPES } from '../utils/entityMeta';

const TRY = ['CYP17A1', 'testosterone', 'AMH', 'metformin', 'steroid hormone biosynthesis'];
const MATCH_LABEL = { name: 'Name match', alias: 'Alias match', identifier: 'Identifier match', description: 'Mentioned in description' } as const;

export default function SearchResultsPage() {
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const state = useAsync(() => (q ? searchEntities(q, { limit: 100 }) : Promise.resolve([])), [q]);
  const status = useAsync(() => getDatasetStatus(), []);
  const hits = state.data ?? [];
  const groups = ENTITY_TYPES.map((t) => ({ type: t, hits: hits.filter((h) => h.entity.type === t) })).filter((g) => g.hits.length);
  const datasetLabel = status.data?.mode === 'live' ? 'the knowledge base' : 'the demonstration dataset';

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Search"
        title={q ? `Results for “${q}”` : 'Search the knowledge base'}
        description={q && !state.loading ? `${hits.length} matching record${hits.length === 1 ? '' : 's'} in ${datasetLabel}.` : undefined}
      />

      {!q ? (
        <div className="panel">
          <EmptyState title="Type in the search bar to begin" body="Search by gene symbol, alias, identifier, or pathway name." />
        </div>
      ) : state.error ? (
        <ErrorState error={state.error} onRetry={state.reload} />
      ) : state.loading && !state.data ? (
        <div className="panel">
          <LoadingRows rows={5} />
        </div>
      ) : hits.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={`No records match “${q}”`}
            body="Check the spelling, or try an alias or identifier. This build contains a small illustrative dataset, so many real entities are not present yet."
            action={
              <div className="flex flex-wrap justify-center gap-1.5">
                {TRY.map((t) => (
                  <Link key={t} to={`/search?q=${encodeURIComponent(t)}`} className="rounded-md border border-line bg-paper px-2.5 py-1 font-mono text-[12px] text-ink-soft hover:border-teal hover:text-teal">
                    {t}
                  </Link>
                ))}
              </div>
            }
          />
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.type} className="panel overflow-hidden">
              <p className="eyebrow border-b border-line bg-paper px-5 py-2.5">
                {ENTITY_META[g.type].plural} · {g.hits.length}
              </p>
              <ul className="divide-y divide-line/70">
                {g.hits.map((h) => (
                  <li key={h.entity.id}>
                    <Link to={`/entity/${h.entity.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-sand/60">
                      <TypeIcon type={h.entity.type} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-ink">{h.entity.name}</span>
                        <span className="block truncate text-[12.5px] text-ink-mute">{h.entity.description}</span>
                      </span>
                      <span className="hidden text-right sm:block">
                        <span className="block font-mono text-[12px] text-ink-soft">{h.entity.primaryId}</span>
                        <span className="block text-[11px] text-ink-mute">{MATCH_LABEL[h.matchedOn]}</span>
                      </span>
                      <span className="hidden md:block">
                        <VerificationBadge value={h.entity.verification} short />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
