import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EntityChips } from '../components/entities/EntityChips';
import { PageContainer } from '../components/layout/AppShell';
import { SourceBadge, VerificationBadge } from '../components/ui/Badges';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingRows } from '../components/ui/States';
import { useAsync } from '../hooks/useAsync';
import { useDebounce } from '../hooks/useDebounce';
import { getPublications } from '../services/repository';
import type { EvidenceCategory } from '../types';
import { EVIDENCE_LABELS, EVIDENCE_NOTES } from '../utils/entityMeta';

export default function EvidencePage() {
  const [text, setText] = useState('');
  const [year, setYear] = useState<string>('');
  const [entityId, setEntityId] = useState('');
  const [category, setCategory] = useState<EvidenceCategory | ''>('');
  const query = useDebounce(text.trim(), 180);

  // Unfiltered list drives the filter option lists.
  const all = useAsync(() => getPublications(), []);
  const results = useAsync(
    () =>
      getPublications({
        query,
        year: year === '' ? undefined : year === 'unknown' ? 'unknown' : Number(year),
        entityId: entityId || undefined,
        category: category || undefined,
      }),
    [query, year, entityId, category],
  );

  const options = useMemo(() => {
    const items = all.data ?? [];
    const years = [...new Set(items.map((i) => i.publication.year).filter((y): y is number => y !== null))].sort((a, b) => b - a);
    const hasUnknown = items.some((i) => i.publication.year === null);
    const entities = [...new Map(items.flatMap((i) => i.entities).map((e) => [e.id, e])).values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    return { years, hasUnknown, entities };
  }, [all.data]);

  const clear = () => {
    setText('');
    setYear('');
    setEntityId('');
    setCategory('');
  };
  const filtered = !!(text || year || entityId || category);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Literature"
        title="Research & evidence"
        description="Publication records linked to entities in the knowledge base, with their evidence category and source metadata."
      />

      <div className="mb-6 rounded-lg border border-line bg-sand/60 px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
        <strong>Association is not causation.</strong> A publication linked to an entity indicates the study addresses that entity. It does
        not establish a causal or clinical conclusion, and no abstracts or findings are reproduced here.
      </div>

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" aria-hidden />
            <input
              aria-label="Search publications"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search titles, identifiers, associated terms…"
              className="h-10 w-full rounded-lg border border-line bg-paper pl-9 pr-3 text-sm placeholder:text-ink-faint focus:border-teal"
            />
          </div>
          <label className="flex items-center gap-2 text-[12px] font-semibold text-ink-mute">
            Year
            <select value={year} onChange={(e) => setYear(e.target.value)} className="h-10 rounded-lg border border-line bg-white px-2.5 text-sm font-semibold text-ink-soft">
              <option value="">Any</option>
              {options.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
              {options.hasUnknown ? <option value="unknown">Not recorded</option> : null}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[12px] font-semibold text-ink-mute">
            Entity
            <select value={entityId} onChange={(e) => setEntityId(e.target.value)} className="h-10 max-w-[200px] rounded-lg border border-line bg-white px-2.5 text-sm font-semibold text-ink-soft">
              <option value="">Any</option>
              {options.entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[12px] font-semibold text-ink-mute">
            Evidence
            <select value={category} onChange={(e) => setCategory(e.target.value as EvidenceCategory | '')} className="h-10 rounded-lg border border-line bg-white px-2.5 text-sm font-semibold text-ink-soft">
              <option value="">Any</option>
              {(Object.keys(EVIDENCE_LABELS) as EvidenceCategory[]).map((c) => (
                <option key={c} value={c}>
                  {EVIDENCE_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          {filtered ? (
            <button type="button" onClick={clear} className="text-[12px] font-semibold text-teal hover:underline">
              Clear filters
            </button>
          ) : null}
        </div>

        <div aria-live="polite" className="min-h-[220px]">
          {results.error ? (
            <ErrorState error={results.error} onRetry={results.reload} />
          ) : results.loading && !results.data ? (
            <LoadingRows rows={3} />
          ) : results.data && results.data.length === 0 ? (
            <EmptyState
              title="No publications match"
              body={filtered ? 'Try removing a filter. The demo dataset contains very few publication records.' : 'No publication records have been imported yet.'}
              action={
                filtered ? (
                  <button type="button" className="btn-primary" onClick={clear}>
                    Clear filters
                  </button>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-line/70">
              {results.data?.map(({ publication: p, entities }) => (
                <li key={p.id} className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-sand-deep px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{EVIDENCE_LABELS[p.evidenceCategory]}</span>
                    <VerificationBadge value={p.verification} short />
                  </div>
                  <Link to={`/entity/${p.id}`} className="mt-2 block max-w-3xl text-[17px] font-bold leading-snug text-ink hover:text-teal">
                    {p.name}
                  </Link>
                  <dl className="mt-3 grid max-w-3xl gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-ink-mute">Authors</dt>
                      <dd className={p.authors ? 'text-ink' : 'italic text-ink-faint'}>{p.authors?.join(', ') ?? 'Not recorded'}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-ink-mute">Year</dt>
                      <dd className={p.year ? 'text-ink' : 'italic text-ink-faint'}>{p.year ?? 'Not recorded'}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-ink-mute">Source</dt>
                      <dd className="flex flex-wrap gap-1.5">
                        {p.sources.map((s, i) => (
                          <SourceBadge key={i} source={s} />
                        ))}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-ink-mute">Identifier</dt>
                      <dd className={`font-mono ${p.pmid ? 'text-ink' : 'italic text-ink-faint'}`}>{p.pmid ? `PMID ${p.pmid}` : p.primaryId}</dd>
                    </div>
                  </dl>
                  <div className="mt-4">
                    <p className="eyebrow mb-1.5">Associated entities</p>
                    <EntityChips entities={entities} empty="No entities linked." />
                  </div>
                  <p className="mt-4 max-w-3xl text-[12px] leading-relaxed text-ink-mute">
                    {EVIDENCE_NOTES[p.evidenceCategory]} {p.pmid ? '' : 'No verified external link is available until a PMID is recorded.'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
