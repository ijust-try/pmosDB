import { ArrowLeft, ArrowRight, ExternalLink, Maximize2, MousePointerClick, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { getEntityById, getEntityRelationships } from '../../services/repository';
import type { Entity } from '../../types';
import { ENTITY_META, RELATION_STATUS_META, SOURCE_NAMES, VERIFICATION_META } from '../../utils/entityMeta';
import { ShapeSwatch } from './GraphLegend';

function NodeList({ entities, onPick }: { entities: Entity[]; onPick: (e: Entity) => void }) {
  return (
    <div className="p-4">
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-midnight-line bg-midnight/60 p-3">
        <MousePointerClick size={16} className="mt-0.5 shrink-0 text-teal-bright" aria-hidden />
        <p className="text-[12.5px] leading-relaxed text-slate-300">
          Select a node to read its dossier summary and connected entities. Drag nodes to rearrange, scroll to zoom, and expand a
          selection to reveal its neighbourhood.
        </p>
      </div>
      <p className="eyebrow !text-slate-400 mb-2">Entities in view ({entities.length})</p>
      <ul className="space-y-0.5">
        {entities.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onPick(e)}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-midnight-3"
            >
              <ShapeSwatch type={e.type} />
              <span className="flex-1 truncate text-[13px] font-semibold text-slate-200">{e.name}</span>
              <span className="text-[10.5px] text-slate-500">{ENTITY_META[e.type].label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GraphInfoPanel({
  selectedId,
  visibleIds,
  visibleEntities,
  onNavigate,
  onExpand,
  onClose,
  onFit,
}: {
  selectedId: string | null;
  visibleIds: ReadonlySet<string>;
  visibleEntities: Entity[];
  onNavigate: (e: Entity) => void;
  onExpand: (id: string) => void;
  onClose: () => void;
  onFit: () => void;
}) {
  const entityState = useAsync(() => (selectedId ? getEntityById(selectedId) : Promise.resolve(null)), [selectedId]);
  const neighbourState = useAsync(() => (selectedId ? getEntityRelationships(selectedId) : Promise.resolve([])), [selectedId]);

  if (!selectedId) {
    return <NodeList entities={visibleEntities} onPick={onNavigate} />;
  }

  const entity = entityState.data;
  const neighbours = neighbourState.data ?? [];
  const hidden = neighbours.filter((n) => !visibleIds.has(n.entity.id)).length;

  if (!entity) {
    return (
      <div className="p-4 text-sm text-slate-400" role="status">
        {entityState.loading ? 'Loading entity…' : 'Entity not found.'}
      </div>
    );
  }

  const meta = ENTITY_META[entity.type];
  const ver = VERIFICATION_META[entity.verification];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-midnight-line p-4">
        <div className="flex items-start justify-between gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold"
            style={{ background: `${meta.graph}22`, color: meta.graph }}
          >
            <ShapeSwatch type={entity.type} size={12} /> {meta.label}
          </span>
          <button type="button" onClick={onClose} aria-label="Close panel" className="rounded p-1 text-slate-400 hover:text-white">
            <X size={15} />
          </button>
        </div>
        <h2 className="mt-2.5 text-[19px] font-extrabold leading-snug tracking-tight text-white">{entity.name}</h2>
        <p className="mt-1 font-mono text-[12px] text-slate-300">
          <span className="text-slate-500">{entity.idLabel}</span> {entity.primaryId}
        </p>
        <span
          className={`mt-2 inline-flex rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${
            entity.verification === 'project-document' ? 'bg-teal-bright/15 text-teal-bright' : 'bg-amber/15 text-[#F0C27A]'
          }`}
          title={ver.label}
        >
          {entity.verification === 'project-document' ? 'ID from project document' : 'Illustrative · ID pending verification'}
        </span>
      </div>

      <div className="scroll-thin scroll-thin-dark flex-1 space-y-5 overflow-y-auto p-4">
        <p className="text-[13px] leading-relaxed text-slate-300">{entity.description}</p>

        {entity.sources.length ? (
          <section>
            <p className="eyebrow !text-slate-500 mb-1.5">Sources</p>
            <div className="flex flex-wrap gap-1.5">
              {entity.sources.map((s, i) => (
                <span key={i} className="rounded-md border border-midnight-line px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                  {SOURCE_NAMES[s.source]}
                  {s.accession ? <span className="ml-1.5 font-mono text-[10.5px] text-slate-500">{s.accession}</span> : null}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="eyebrow !text-slate-500">Connected entities ({neighbours.length})</p>
            {hidden > 0 ? <span className="text-[10.5px] text-slate-500">{hidden} not in view</span> : null}
          </div>
          {neighbourState.loading && !neighbours.length ? (
            <p className="text-[12.5px] text-slate-500">Loading relationships…</p>
          ) : neighbours.length === 0 ? (
            <p className="text-[12.5px] text-slate-500">No relationships recorded for this entity in the demo dataset.</p>
          ) : (
            <ul className="space-y-1">
              {neighbours.map((n) => {
                const inView = visibleIds.has(n.entity.id);
                const illustrative = n.relationship.status === 'demo-unvalidated';
                return (
                  <li key={n.relationship.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate(n.entity)}
                      className="group w-full rounded-lg border border-transparent px-2 py-1.5 text-left hover:border-midnight-line hover:bg-midnight-3"
                      title={RELATION_STATUS_META[n.relationship.status].label}
                    >
                      <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-slate-400">
                        {n.direction === 'in' ? <ArrowLeft size={11} aria-hidden /> : null}
                        <span className={illustrative ? 'underline decoration-dashed underline-offset-2' : ''}>{n.relationship.label}</span>
                        {n.direction === 'out' ? <ArrowRight size={11} aria-hidden /> : null}
                        {!inView ? <span className="ml-auto text-teal-bright">+ show</span> : null}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <ShapeSwatch type={n.entity.type} />
                        <span className="truncate text-[13px] font-semibold text-slate-100">{n.entity.name}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {neighbours.some((n) => n.relationship.note) ? (
          <section>
            <p className="eyebrow !text-slate-500 mb-1.5">Notes</p>
            <ul className="space-y-1.5">
              {neighbours
                .filter((n) => n.relationship.note)
                .map((n) => (
                  <li key={n.relationship.id} className="text-[12px] leading-relaxed text-slate-400">
                    <span className="font-semibold text-slate-300">{n.entity.name}:</span> {n.relationship.note}
                  </li>
                ))}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-midnight-line p-3">
        <button type="button" className="btn-dark w-full" onClick={() => onExpand(entity.id)} disabled={hidden === 0}>
          <Maximize2 size={14} aria-hidden /> {hidden === 0 ? 'Neighbourhood shown' : `Expand (+${hidden})`}
        </button>
        <button type="button" className="btn-dark flex-1" onClick={onFit}>
          Fit view
        </button>
        <Link to={`/entity/${entity.id}`} className="btn-dark flex-[2] whitespace-nowrap">
          Open dossier <ExternalLink size={13} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
