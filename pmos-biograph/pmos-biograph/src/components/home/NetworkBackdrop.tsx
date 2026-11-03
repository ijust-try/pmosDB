import { ENTITY_META } from '../../utils/entityMeta';
import type { EntityType } from '../../types';

/** A decorative network: nodes in the record-type colours, with edges that slowly carry a flowing dash. */
const NODES: Array<{ x: number; y: number; r: number; type: EntityType }> = [
  { x: 520, y: 90, r: 9, type: 'gene' },
  { x: 640, y: 170, r: 7, type: 'protein' },
  { x: 740, y: 80, r: 6, type: 'hormone' },
  { x: 580, y: 270, r: 10, type: 'pathway' },
  { x: 700, y: 330, r: 7, type: 'therapeutic' },
  { x: 470, y: 200, r: 6, type: 'biomarker' },
  { x: 780, y: 230, r: 6, type: 'publication' },
  { x: 430, y: 330, r: 7, type: 'gene' },
  { x: 560, y: 410, r: 6, type: 'protein' },
  { x: 690, y: 450, r: 8, type: 'pathway' },
  { x: 330, y: 120, r: 5, type: 'publication' },
  { x: 300, y: 260, r: 6, type: 'hormone' },
];
const EDGES: Array<[number, number]> = [
  [0, 1], [1, 2], [1, 3], [3, 4], [0, 5], [5, 3], [4, 6], [3, 7], [7, 8], [8, 9], [9, 4], [5, 10], [10, 0], [7, 11], [11, 5], [6, 1],
];

export function NetworkBackdrop({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 860 520"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      focusable="false"
    >
      <g stroke="#6F9BEA" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="4 8" opacity="0.55">
        {EDGES.map(([a, b], i) => (
          <line
            key={i}
            x1={NODES[a].x}
            y1={NODES[a].y}
            x2={NODES[b].x}
            y2={NODES[b].y}
            className="animate-dash-flow"
            style={{ animationDelay: `${(i % 5) * -1.2}s` }}
          />
        ))}
      </g>
      {NODES.map((n, i) => {
        const color = ENTITY_META[n.type].graph;
        return (
          <g key={i}>
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r * 1.6}
              fill={color}
              className="animate-pulse-ring"
              style={{ transformBox: 'fill-box', transformOrigin: 'center', animationDelay: `${(i % 6) * -0.7}s` }}
            />
            <circle cx={n.x} cy={n.y} r={n.r} fill={color} stroke="#0B2A66" strokeWidth="2" />
          </g>
        );
      })}
    </svg>
  );
}
