import type { EntityType } from '../../types';
import { ENTITY_META, ENTITY_TYPES } from '../../utils/entityMeta';

export function ShapeSwatch({ type, size = 14 }: { type: EntityType; size?: number }) {
  const { shape, graph } = ENTITY_META[type];
  const s = size;
  const common = { fill: graph, stroke: '#0A1330', strokeWidth: 1 };
  let el;
  switch (shape) {
    case 'ellipse':
      el = <circle cx={8} cy={8} r={6} {...common} />;
      break;
    case 'hexagon':
      el = <polygon points="8,1.5 14,4.75 14,11.25 8,14.5 2,11.25 2,4.75" {...common} />;
      break;
    case 'diamond':
      el = <polygon points="8,1 15,8 8,15 1,8" {...common} />;
      break;
    case 'octagon':
      el = <polygon points="5,1.5 11,1.5 14.5,5 14.5,11 11,14.5 5,14.5 1.5,11 1.5,5" {...common} />;
      break;
    case 'rectangle':
      el = <rect x={2} y={3} width={12} height={10} {...common} />;
      break;
    case 'round-rectangle':
      el = <rect x={1.5} y={3} width={13} height={10} rx={3.5} {...common} />;
      break;
    case 'round-tag':
      el = <path d="M2 3 H11 L15 8 L11 13 H2 Z" {...common} />;
      break;
    default:
      el = <ellipse cx={8} cy={8} rx={6.5} ry={5} {...common} />;
  }
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" aria-hidden>
      {el}
    </svg>
  );
}

export function GraphLegend({
  hidden,
  onToggle,
  counts,
}: {
  hidden: ReadonlySet<EntityType>;
  onToggle: (t: EntityType) => void;
  counts: Partial<Record<EntityType, number>>;
}) {
  return (
    <div className="rounded-xl border border-midnight-line bg-midnight-2/90 px-3 py-2 shadow-lift backdrop-blur">
      <ul className="flex flex-wrap items-center gap-x-1 gap-y-0.5" aria-label="Node categories">
        <li className="eyebrow !text-slate-500 mr-1.5 hidden sm:block">Filter</li>
        {ENTITY_TYPES.map((t) => {
          const off = hidden.has(t);
          const n = counts[t] ?? 0;
          return (
            <li key={t}>
              <button
                type="button"
                onClick={() => onToggle(t)}
                aria-pressed={!off}
                aria-label={`${off ? 'Show' : 'Hide'} ${ENTITY_META[t].plural}`}
                className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11.5px] font-semibold transition-colors hover:bg-midnight-3 ${
                  off ? 'text-slate-500 line-through decoration-slate-600' : 'text-slate-200'
                }`}
              >
                <span className={off ? 'opacity-35' : ''}>
                  <ShapeSwatch type={t} size={13} />
                </span>
                {ENTITY_META[t].plural}
                <span className="font-mono text-[10px] font-normal text-slate-500">{n}</span>
              </button>
            </li>
          );
        })}
        <li className="ml-auto hidden items-center gap-3 border-l border-midnight-line pl-3 text-[10.5px] text-slate-400 lg:flex">
          <span className="flex items-center gap-1.5">
            <svg width="22" height="6" aria-hidden>
              <line x1="0" y1="3" x2="22" y2="3" stroke="#7C8FE0" strokeWidth="1.6" />
            </svg>
            Project document
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="22" height="6" aria-hidden>
              <line x1="0" y1="3" x2="22" y2="3" stroke="#7C8FE0" strokeWidth="1.6" strokeDasharray="4 3" />
            </svg>
            Illustrative
          </span>
        </li>
      </ul>
    </div>
  );
}
