import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { Entity, ListItem, SortKey } from '../../types';
import { SOURCE_NAMES } from '../../utils/entityMeta';
import { TypeBadge, TypeIcon, VerificationBadge } from '../ui/Badges';

interface Props {
  items: ListItem[];
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  onOpen: (entity: Entity) => void;
  selectedId?: string | null;
}

function SortHeader({
  label,
  k,
  props,
  className = '',
}: {
  label: string;
  k: SortKey;
  props: Pick<Props, 'sortBy' | 'sortDir' | 'onSort'>;
  className?: string;
}) {
  const active = props.sortBy === k;
  const Icon = !active ? ArrowUpDown : props.sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (props.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-4 py-2.5 text-left ${className}`}
    >
      <button
        type="button"
        onClick={() => props.onSort(k)}
        className={`eyebrow inline-flex items-center gap-1.5 hover:text-ink ${active ? '!text-ink' : ''}`}
      >
        {label}
        <Icon size={11} aria-hidden />
      </button>
    </th>
  );
}

export function EntityTable(props: Props) {
  const { items, onOpen, selectedId } = props;
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead className="border-b border-line bg-paper">
          <tr>
            <SortHeader label="Entity" k="name" props={props} />
            <SortHeader label="Type" k="type" props={props} />
            <SortHeader label="Identifier" k="primaryId" props={props} />
            <th scope="col" className="eyebrow px-4 py-2.5 text-left">
              Sources
            </th>
            <SortHeader label="Links" k="relationships" props={props} className="text-right" />
            <th scope="col" className="eyebrow px-4 py-2.5 text-left">
              Provenance
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ entity, relationshipCount }) => (
            <tr
              key={entity.id}
              onClick={() => onOpen(entity)}
              className={`cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-sand/60 ${
                selectedId === entity.id ? 'bg-teal-soft/40' : ''
              }`}
            >
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(entity);
                  }}
                  className="flex items-center gap-3 text-left"
                  aria-label={`Open ${entity.name}`}
                >
                  <TypeIcon type={entity.type} size={32} />
                  <span className="min-w-0">
                    <span className="block max-w-[300px] truncate font-bold text-ink">{entity.name}</span>
                    {entity.aliases.length ? (
                      <span className="block max-w-[300px] truncate text-[12px] text-ink-mute">{entity.aliases.slice(0, 3).join(' · ')}</span>
                    ) : null}
                  </span>
                </button>
              </td>
              <td className="px-4 py-3">
                <TypeBadge type={entity.type} />
              </td>
              <td className="px-4 py-3">
                <span className="block font-mono text-[12.5px] font-medium text-ink">{entity.primaryId}</span>
                <span className="block text-[11px] text-ink-mute">{entity.idLabel}</span>
              </td>
              <td className="px-4 py-3 text-[12.5px] text-ink-soft">
                {entity.sources.length
                  ? [...new Set(entity.sources.map((s) => SOURCE_NAMES[s.source]))].join(', ')
                  : <span className="text-ink-faint">None mapped</span>}
              </td>
              <td className="px-4 py-3 text-right font-mono text-[12.5px] text-ink-soft">{relationshipCount}</td>
              <td className="px-4 py-3">
                <VerificationBadge value={entity.verification} short />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EntityList({ items, onOpen, selectedId }: Pick<Props, 'items' | 'onOpen' | 'selectedId'>) {
  return (
    <ul className="divide-y divide-line/70">
      {items.map(({ entity, relationshipCount }) => (
        <li key={entity.id}>
          <button
            type="button"
            onClick={() => onOpen(entity)}
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-sand/60 ${
              selectedId === entity.id ? 'bg-teal-soft/40' : ''
            }`}
          >
            <TypeIcon type={entity.type} size={28} />
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{entity.name}</span>
            <span className="hidden font-mono text-[12px] text-ink-mute sm:block">{entity.primaryId}</span>
            <TypeBadge type={entity.type} compact />
            <span className="w-10 text-right font-mono text-[11.5px] text-ink-mute">{relationshipCount}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
