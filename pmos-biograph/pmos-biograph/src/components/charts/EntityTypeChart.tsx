import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DatasetSummary } from '../../types';
import { ENTITY_META, ENTITY_TYPES } from '../../utils/entityMeta';

/** Composition of the demonstration dataset by entity type (purpose: show what is represented). */
export function EntityTypeChart({ summary }: { summary: DatasetSummary }) {
  const data = ENTITY_TYPES.map((t) => ({
    type: t,
    name: ENTITY_META[t].plural,
    count: summary.entityCounts[t],
    color: ENTITY_META[t].color,
  }));
  return (
    <div className="h-64 w-full" role="img" aria-label={`Records by entity type: ${data.map((d) => `${d.name} ${d.count}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }} barCategoryGap={7}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={128}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: '#3B4660', fontWeight: 600 }}
          />
          <Tooltip
            cursor={{ fill: 'rgba(16,26,51,0.04)' }}
            formatter={(v) => [String(v), 'Records']}
            contentStyle={{ borderRadius: 8, border: '1px solid #E3DDD0', fontSize: 12 }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#6B7488', fontFamily: 'IBM Plex Mono' }}>
            {data.map((d) => (
              <Cell key={d.type} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
