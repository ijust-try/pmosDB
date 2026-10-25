import { ChevronLeft, ChevronRight, LayoutList, Search, Table2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EntityList, EntityTable } from '../components/entities/EntityTable';
import { EntityPreviewPanel } from '../components/entities/EntityPreviewPanel';
import { PageContainer } from '../components/layout/AppShell';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingRows } from '../components/ui/States';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { listEntities } from '../services/repository';
import type { Entity, EntityType, SortKey, SourceId } from '../types';
import { ENTITY_META, ENTITY_TYPES, SOURCE_IDS, SOURCE_NAMES } from '../utils/entityMeta';

const PAGE_SIZE = 10;

export default function ExplorePage() {
  const [params] = useSearchParams();
  const initialType = params.get('type') as EntityType | null;

  const [text, setText] = useState('');
  const [types, setTypes] = useState<EntityType[]>(initialType && ENTITY_TYPES.includes(initialType) ? [initialType] : []);
  const [source, setSource] = useState<SourceId | ''>('');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [view, setView] = useState<'table' | 'list'>('table');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Entity | null>(null);
  const query = useDebounce(text, 200);

  // Keep the type filter in sync if the user arrives via a metric link.
  useEffect(() => {
    const t = params.get('type') as EntityType | null;
    setTypes(t && ENTITY_TYPES.includes(t) ? [t] : []);
  }, [params]);

  useEffect(() => setPage(1), [query, types, source, sortBy, sortDir]);

  const state = useAsync(
    () =>
      listEntities({
        query,
        types,
        sources: source ? [source] : [],
        sortBy,
        sortDir,
        page,
        pageSize: PAGE_SIZE,
      }),
    [query, types.join(','), source, sortBy, sortDir, page],
  );

  const toggleType = (t: EntityType) => setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const onSort = (k: SortKey) => {
    if (k === sortBy) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(k);
      setSortDir('asc');
    }
  };
  const clearAll = () => {
    setText('');
    setTypes([]);
    setSource('');
  };
  const filtered = !!(text || types.length || source);

  const total = state.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Research catalogue"
        title="Explore entities"
        description="Search and filter every gene, protein, hormone, biomarker, pathway, therapeutic, publication and biological process in the knowledge base."
      />

      <div className="panel overflow-hidden">
        {/* Controls */}
        <div className="space-y-3 border-b border-line p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" aria-hidden />
              <input
                aria-label="Search the catalogue"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Search names, aliases, identifiers, descriptions…"
                className="h-10 w-full rounded-lg border border-line bg-paper pl-9 pr-9 text-sm placeholder:text-ink-faint focus:border-teal"
              />
              {text ? (
                <button type="button" aria-label="Clear search" onClick={() => setText('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink">
                  <X size={14} />
                </button>
              ) : null}
            </div>
            <label className="flex items-center gap-2 text-[12px] font-semibold text-ink-mute">
              Source
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as SourceId | '')}
                className="h-10 rounded-lg border border-line bg-white px-2.5 text-sm font-semibold text-ink-soft"
              >
                <option value="">All sources</option>
                {SOURCE_IDS.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_NAMES[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[12px] font-semibold text-ink-mute">
              Sort
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as SortKey);
                  setSortDir('asc');
                }}
                className="h-10 rounded-lg border border-line bg-white px-2.5 text-sm font-semibold text-ink-soft"
              >
                <option value="name">Name</option>
                <option value="type">Type</option>
                <option value="primaryId">Identifier</option>
                <option value="relationships">Connections</option>
              </select>
            </label>
            <button
              type="button"
              className="btn-ghost !h-10"
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              aria-label={`Sort direction: ${sortDir === 'asc' ? 'ascending' : 'descending'}. Click to reverse.`}
            >
              {sortDir === 'asc' ? 'A → Z' : 'Z → A'}
            </button>
            <div role="group" aria-label="View" className="flex overflow-hidden rounded-lg border border-line">
              {(
                [
                  ['table', Table2, 'Table view'],
                  ['list', LayoutList, 'Compact list view'],
                ] as const
              ).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-label={label}
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={`grid h-10 w-10 place-items-center ${view === v ? 'bg-midnight text-white' : 'bg-white text-ink-mute hover:bg-sand'}`}
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by entity type">
            {ENTITY_TYPES.map((t) => {
              const on = types.includes(t);
              const m = ENTITY_META[t];
              const Icon = m.icon;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleType(t)}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors"
                  style={
                    on
                      ? { background: m.color, borderColor: m.color, color: '#fff' }
                      : { background: '#fff', borderColor: '#E3DDD0', color: '#3B4660' }
                  }
                >
                  <Icon size={12} aria-hidden /> {m.plural}
                </button>
              );
            })}
            {filtered ? (
              <button type="button" onClick={clearAll} className="ml-1 text-[12px] font-semibold text-teal hover:underline">
                Clear filters
              </button>
            ) : null}
          </div>
        </div>

        {/* Results */}
        <div aria-live="polite" className="min-h-[320px]">
          {state.error ? (
            <ErrorState error={state.error} onRetry={state.reload} />
          ) : state.loading && !state.data ? (
            <LoadingRows rows={7} />
          ) : state.data && state.data.items.length === 0 ? (
            <EmptyState
              title="No matching entities"
              body={
                text
                  ? `Nothing matches “${text}” with the current filters. Try a gene symbol, an alias, or fewer filters.`
                  : 'No entities match the current filters.'
              }
              action={
                <button type="button" className="btn-primary" onClick={clearAll}>
                  Clear filters
                </button>
              }
            />
          ) : state.data ? (
            <div className={state.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              {view === 'table' ? (
                <EntityTable items={state.data.items} sortBy={sortBy} sortDir={sortDir} onSort={onSort} onOpen={setSelected} selectedId={selected?.id} />
              ) : (
                <EntityList items={state.data.items} onOpen={setSelected} selectedId={selected?.id} />
              )}
            </div>
          ) : null}
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper px-4 py-2.5">
          <p className="text-[12.5px] text-ink-mute">
            {total === 0 ? 'No records' : `Showing ${from}–${to} of ${total}`}
          </p>
          <div className="flex items-center gap-1.5">
            <button type="button" className="btn-ghost !px-2 !py-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeft size={15} />
            </button>
            <span className="px-2 font-mono text-[12px] text-ink-soft">
              {page} / {pages}
            </span>
            <button type="button" className="btn-ghost !px-2 !py-1" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      <EntityPreviewPanel entity={selected} onClose={() => setSelected(null)} />
    </PageContainer>
  );
}
