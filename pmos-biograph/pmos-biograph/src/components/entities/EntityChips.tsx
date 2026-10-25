import { Link } from 'react-router-dom';
import type { Entity } from '../../types';
import { ENTITY_META } from '../../utils/entityMeta';

/** Row of links to entity dossiers, or an honest "not yet linked" message. */
export function EntityChips({ entities, empty }: { entities: Entity[]; empty: string }) {
  if (entities.length === 0) return <p className="text-[13px] italic text-ink-faint">{empty}</p>;
  const unique = [...new Map(entities.map((e) => [e.id, e])).values()];
  return (
    <ul className="flex flex-wrap gap-1.5">
      {unique.map((e) => {
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
  );
}
