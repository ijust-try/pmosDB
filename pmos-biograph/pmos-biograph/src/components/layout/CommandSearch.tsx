import { CornerDownLeft, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { useDebounce } from '../../hooks/useDebounce';
import { searchEntities } from '../../services/repository';
import type { EntityType, SearchHit } from '../../types';
import { ENTITY_META, ENTITY_TYPES } from '../../utils/entityMeta';
import { TypeIcon } from '../ui/Badges';

const SUGGESTIONS = ['CYP17A1', 'testosterone', 'AMH', 'metformin', 'steroid hormone biosynthesis'];

export function CommandSearch() {
  const navigate = useNavigate();
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebounce(query.trim(), 160);

  const { data: hits = [], loading } = useAsync<SearchHit[]>(
    () => (debounced ? searchEntities(debounced, { limit: 10 }) : Promise.resolve([])),
    [debounced],
  );

  // Group by type, but keep a flat ordered list for keyboard navigation.
  const { groups, flat } = useMemo(() => {
    const byType = new Map<EntityType, SearchHit[]>();
    for (const h of hits) byType.set(h.entity.type, [...(byType.get(h.entity.type) ?? []), h]);
    const groups = ENTITY_TYPES.filter((t) => byType.has(t)).map((t) => ({ type: t, hits: byType.get(t)! }));
    return { groups, flat: groups.flatMap((g) => g.hits) };
  }, [hits]);

  useEffect(() => setActive(flat.length ? 0 : -1), [flat]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, []);

  const close = () => {
    setOpen(false);
    inputRef.current?.blur();
  };

  const openEntity = (hit: SearchHit) => {
    close();
    setQuery('');
    navigate(`/entity/${hit.entity.id}`);
  };

  const submitAll = () => {
    if (!query.trim()) return;
    close();
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (flat.length ? (a + 1) % flat.length : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && flat[active] && debounced === query.trim()) openEntity(flat[active]);
      else submitAll();
    } else if (e.key === 'Escape') {
      if (query) setQuery('');
      else close();
    }
  };

  const listId = `${uid}-list`;
  const showPanel = open;

  return (
    <div ref={wrapRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" aria-hidden />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${uid}-opt-${active}` : undefined}
          aria-label="Search entities"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search genes, hormones, pathways, drugs…"
          className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-16 text-sm text-ink placeholder:text-ink-faint focus:border-teal"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-9 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-mute hover:text-ink"
          >
            <X size={14} />
          </button>
        ) : null}
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-sand px-1.5 font-mono text-[10px] text-ink-mute sm:block">
          /
        </kbd>
      </div>

      {showPanel ? (
        <div className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-xl border border-line bg-white shadow-lift">
          <div id={listId} role="listbox" aria-label="Search suggestions" className="scroll-thin max-h-[26rem] overflow-y-auto">
            {!debounced ? (
              <div className="p-3">
                <p className="eyebrow mb-2">Try searching for</p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setQuery(s);
                        inputRef.current?.focus();
                      }}
                      className="rounded-md border border-line bg-paper px-2 py-1 font-mono text-[11.5px] text-ink-soft hover:border-teal hover:text-teal"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : loading && !hits.length ? (
              <p className="px-4 py-5 text-sm text-ink-mute" role="status">
                Searching…
              </p>
            ) : !flat.length ? (
              <div className="px-4 py-5">
                <p className="text-sm font-semibold text-ink">No matches for “{debounced}”</p>
                <p className="mt-1 text-[12.5px] text-ink-mute">
                  Check spelling, or try a gene symbol, alias, or identifier. This demo contains a small illustrative dataset.
                </p>
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.type} role="group" aria-label={ENTITY_META[g.type].plural}>
                  <p className="eyebrow bg-paper px-4 py-1.5">{ENTITY_META[g.type].plural}</p>
                  {g.hits.map((h) => {
                    const idx = flat.indexOf(h);
                    return (
                      <button
                        key={h.entity.id}
                        id={`${uid}-opt-${idx}`}
                        role="option"
                        aria-selected={idx === active}
                        type="button"
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => openEntity(h)}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left ${idx === active ? 'bg-teal-soft/60' : ''}`}
                      >
                        <TypeIcon type={h.entity.type} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink">{h.entity.name}</span>
                          <span className="block truncate font-mono text-[11px] text-ink-mute">
                            {h.entity.idLabel}: {h.entity.primaryId}
                            {h.matchedOn === 'alias' ? ' · matched alias' : ''}
                          </span>
                        </span>
                        {idx === active ? <CornerDownLeft size={13} className="text-ink-mute" aria-hidden /> : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          {debounced ? (
            <button
              type="button"
              onClick={submitAll}
              className="flex w-full items-center justify-between border-t border-line bg-paper px-4 py-2 text-left text-[12.5px] font-semibold text-ink-soft hover:text-teal"
            >
              See all results for “{debounced}”
              <span className="font-mono text-[10px] text-ink-mute">Enter</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
