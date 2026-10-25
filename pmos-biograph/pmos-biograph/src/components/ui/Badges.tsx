import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { EntityType, IntegrationStatus, RelationStatus, SourceRef, Verification } from '../../types';
import {
  ENTITY_META,
  RELATION_STATUS_META,
  SOURCE_NAMES,
  STATUS_META,
  VERIFICATION_META,
} from '../../utils/entityMeta';

export function TypeBadge({ type, compact = false }: { type: EntityType; compact?: boolean }) {
  const m = ENTITY_META[type];
  const Icon = m.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: m.soft, color: m.color }}
    >
      <Icon size={12} strokeWidth={2.2} aria-hidden />
      {compact ? null : m.label}
      {compact ? <span className="sr-only">{m.label}</span> : null}
    </span>
  );
}

export function TypeIcon({ type, size = 32 }: { type: EntityType; size?: number }) {
  const m = ENTITY_META[type];
  const Icon = m.icon;
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-lg"
      style={{ width: size, height: size, background: m.soft, color: m.color }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
    </span>
  );
}

export function VerificationBadge({ value, short = false }: { value: Verification; short?: boolean }) {
  const m = VERIFICATION_META[value];
  const Icon = value === 'project-document' ? CheckCircle2 : AlertTriangle;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${m.tone}`} title={m.label}>
      <Icon size={11} aria-hidden />
      {short ? m.short : m.label}
    </span>
  );
}

export function RelationStatusBadge({ status }: { status: RelationStatus }) {
  const m = RELATION_STATUS_META[status];
  return <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${m.tone}`}>{m.label}</span>;
}

export function StatusPill({ status }: { status: IntegrationStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${m.tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} aria-hidden />
      {m.label}
    </span>
  );
}

export function SourceBadge({ source }: { source: SourceRef }) {
  const label = SOURCE_NAMES[source.source];
  const body = (
    <>
      <span>{label}</span>
      {source.accession ? <span className="font-mono text-[10.5px] text-ink-mute">{source.accession}</span> : null}
    </>
  );
  const cls =
    'inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-soft';
  return source.url ? (
    <a href={source.url} target="_blank" rel="noreferrer" className={`${cls} hover:border-teal hover:text-teal`}>
      {body}
    </a>
  ) : (
    <span className={cls}>{body}</span>
  );
}

export function Identifier({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="eyebrow !text-[10px]">{label}</span>
      <span className="font-mono text-[12.5px] font-medium text-ink">{value}</span>
    </span>
  );
}
