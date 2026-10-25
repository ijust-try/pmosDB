import { Search } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { useDebounce } from '../../hooks/useDebounce';
import { searchEntities } from '../../services/repository';
import type { Entity } from '../../types';
import { ENTITY_META } from '../../utils/entityMeta';
import { ShapeSwatch } from './GraphLegend';

export function GraphSearch({ onPick }: { onPick: (e: Entity) => void }) {
  const uid = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebounce(q.trim(), 140);
  const { data: hits = [] } = useAsync(
    () => (debounced ? searchEntities(debounced, { limit: 7 }) : Promise.resolve([])),
    [debounced],
  );
  useEffect(() => setActive(0), [hits]);

  const pick = (e: Entity) => {
    setQ('');
    setOpen(false);
    onPick(e);
  };

  return (
    <div className="relative w-full max-w-xs">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        role="combobox"
        aria-expanded={open && !!debounced}
        aria-controls={`${uid}-list`}
        aria-label="Find an entity in the graph"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && hits[active]) {
            e.preventDefault();
            pick(hits[active].entity);
          } else if (e.key === 'Escape') {
            setQ('');
            setOpen(false);
          }
        }}
        placeholder="Find & highlight a node…"
        className="h-9 w-full rounded-lg border border-midnight-line bg-midnight-2/90 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 backdrop-blur focus:border-teal-bright"
      />
      {open && debounced ? (
        <ul
          id={`${uid}-list`}
          role="listbox"
          className="absolute left-0 right-0 top-10 z-20 overflow-hidden rounded-xl border border-midnight-line bg-midnight-2 shadow-lift"
        >
          {hits.length === 0 ? (
            <li className="px-3 py-3 text-[12.5px] text-slate-400">No entity matches “{debounced}”.</li>
          ) : (
            hits.map((h, i) => (
              <li key={h.entity.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(h.entity)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${i === active ? 'bg-midnight-3' : ''}`}
                >
                  <ShapeSwatch type={h.entity.type} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-slate-100">{h.entity.name}</span>
                    <span className="block text-[10.5px] text-slate-400">{ENTITY_META[h.entity.type].label}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
