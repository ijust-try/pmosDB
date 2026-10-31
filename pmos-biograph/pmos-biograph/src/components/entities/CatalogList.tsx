import { Search } from 'lucide-react';
import type { Entity } from '../../types';
import { EmptyState, LoadingRows } from '../ui/States';
import { TypeIcon } from '../ui/Badges';

/** Searchable master list used by the Pathways and Therapeutics pages. */
export function CatalogList({
  items,
  loading,
  selectedId,
  onSelect,
  query,
  onQuery,
  placeholder,
  label,
  trailing,
}: {
  items: Entity[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
  label: string;
  /** Optional short right-aligned label per row, e.g. an evidence score. */
  trailing?: (e: Entity) => string | null;
}) {
  return (
    <div className="panel overflow-hidden lg:sticky lg:top-20">
      <div className="border-b border-line p-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" aria-hidden />
          <input
            aria-label={label}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={placeholder}
            className="h-9 w-full rounded-lg border border-line bg-paper pl-9 pr-3 text-sm placeholder:text-ink-faint focus:border-teal"
          />
        </div>
      </div>
      {loading && items.length === 0 ? (
        <LoadingRows rows={3} />
      ) : items.length === 0 ? (
        <EmptyState title="No matches" body={query ? `Nothing matches “${query}”.` : 'Nothing to show yet.'} />
      ) : (
        <ul className="divide-y divide-line/70" role="listbox" aria-label={label}>
          {items.map((e) => (
            <li key={e.id} role="option" aria-selected={e.id === selectedId}>
              <button
                type="button"
                onClick={() => onSelect(e.id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sand/60 ${
                  e.id === selectedId ? 'bg-teal-soft/50' : ''
                }`}
              >
                <TypeIcon type={e.type} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{e.name}</span>
                  <span className="block truncate font-mono text-[11.5px] text-ink-mute">{e.primaryId}</span>
                </span>
                {trailing?.(e) ? <span className="shrink-0 font-mono text-[11.5px] font-semibold text-teal">{trailing(e)}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
