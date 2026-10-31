import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Entity } from '../../types';
import { ENTITY_META } from '../../utils/entityMeta';

/**
 * Row of links to entity dossiers, or an honest "not yet linked" message.
 * Long lists collapse to `max` items with a toggle.
 */
export function EntityChips({ entities, empty, max = 16 }: { entities: Entity[]; empty: string; max?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (entities.length === 0) return <p className="text-[13px] italic text-ink-faint">{empty}</p>;
  const unique = [...new Map(entities.map((e) => [e.id, e])).values()];
  const shown = expanded ? unique : unique.slice(0, max);
  return (
    <div>
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((e) => {
          const m = ENTITY_META[e.type];
          const Icon = m.icon;
          return (
            <li key={e.id}>
              <Link
                to={`/entity/${e.id}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1 text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-teal hover:text-teal"
              >
                <Icon size={13} style={{ color: m.color }} aria-hidden />
                {e.name}
              </Link>
            </li>
          );
        })}
      </ul>
      {unique.length > max && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2.5 text-[12.5px] font-bold text-teal hover:underline"
        >
          {expanded ? 'Show fewer' : `Show all ${unique.length}`}
        </button>
      )}
    </div>
  );
}
