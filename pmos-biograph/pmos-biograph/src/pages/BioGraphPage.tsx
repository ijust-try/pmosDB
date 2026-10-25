import { ChevronRight, Layers, Maximize, RotateCcw, Shuffle, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GraphCanvas, type GraphHandle } from '../components/graph/GraphCanvas';
import { GraphInfoPanel } from '../components/graph/GraphInfoPanel';
import { GraphLegend } from '../components/graph/GraphLegend';
import { GraphSearch } from '../components/graph/GraphSearch';
import { ErrorState } from '../components/ui/States';
import { getDefaultGraphFocus, getEntityRelationships, getGraphNeighbourhood } from '../services/repository';
import type { Entity, EntityType, Relationship } from '../types';

const INITIAL_DEPTH = 3;

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-lg border border-midnight-line bg-midnight-2/90 text-slate-300 shadow-lift backdrop-blur transition-colors hover:bg-midnight-3 hover:text-white"
    >
      {children}
    </button>
  );
}

export default function BioGraphPage() {
  const [params] = useSearchParams();
  const focusId = params.get('focus') ?? getDefaultGraphFocus();
  const handle = useRef<GraphHandle>(null);

  const [entities, setEntities] = useState<Map<string, Entity>>(new Map());
  const [rels, setRels] = useState<Map<string, Relationship>>(new Map());
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<EntityType>>(new Set());
  const [path, setPath] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<Error>();
  const [resetTick, setResetTick] = useState(0);
  const [legendOpen, setLegendOpen] = useState(true);

  // ── Initial neighbourhood ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    getGraphNeighbourhood(focusId, INITIAL_DEPTH)
      .then((g) => {
        if (cancelled) return;
        setEntities(new Map(g.entities.map((e) => [e.id, e])));
        setRels(new Map(g.relationships.map((r) => [r.id, r])));
        setVisible(new Set(g.entities.map((e) => e.id)));
        setSelected(null);
        setPath(g.entities.some((e) => e.id === focusId) ? [focusId] : []);
        setHighlight(null);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [focusId, resetTick]);

  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(null), 5000);
    return () => clearTimeout(t);
  }, [highlight]);

  // ── Derived graph ────────────────────────────────────────────────────────
  const graph = useMemo(() => {
    const ents = [...visible].map((id) => entities.get(id)).filter((e): e is Entity => !!e);
    return {
      entities: ents,
      relationships: [...rels.values()].filter((r) => visible.has(r.source) && visible.has(r.target)),
    };
  }, [visible, entities, rels]);

  const counts = useMemo(() => {
    const c: Partial<Record<EntityType, number>> = {};
    graph.entities.forEach((e) => {
      c[e.type] = (c[e.type] ?? 0) + 1;
    });
    return c;
  }, [graph.entities]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const centerSoon = useCallback((id: string, delay = 0) => {
    setTimeout(() => handle.current?.centerOn(id), delay);
  }, []);

  const mergeNeighbours = useCallback(async (ids: string[]) => {
    const lists = await Promise.all(ids.map((id) => getEntityRelationships(id)));
    const flat = lists.flat();
    setEntities((prev) => {
      const next = new Map(prev);
      flat.forEach((n) => next.set(n.entity.id, n.entity));
      return next;
    });
    setRels((prev) => {
      const next = new Map(prev);
      flat.forEach((n) => next.set(n.relationship.id, n.relationship));
      return next;
    });
    return flat;
  }, []);

  /** Add one node (and its edges to nodes already in view). */
  const reveal = useCallback(
    async (entity: Entity) => {
      setEntities((prev) => new Map(prev).set(entity.id, entity));
      await mergeNeighbours([entity.id]);
      setVisible((prev) => new Set(prev).add(entity.id));
    },
    [mergeNeighbours],
  );

  /** Reveal every neighbour of a node, then fetch edges between the newcomers and the rest. */
  const expand = useCallback(
    async (id: string) => {
      const direct = await mergeNeighbours([id]);
      const newIds = [...new Set(direct.map((n) => n.entity.id))];
      setVisible((prev) => new Set([...prev, ...newIds]));
      await mergeNeighbours(newIds);
      centerSoon(id, 540);
    },
    [mergeNeighbours, centerSoon],
  );

  const pushPath = useCallback((id: string) => {
    setPath((p) => (p[p.length - 1] === id ? p : [...p, id].slice(-8)));
  }, []);

  const selectNode = useCallback(
    (id: string | null) => {
      setSelected(id);
      if (id) pushPath(id);
    },
    [pushPath],
  );

  const goTo = useCallback(
    async (entity: Entity, highlightIt = false) => {
      const wasVisible = visible.has(entity.id);
      if (!wasVisible) {
        await reveal(entity);
        // A node found via search is shown with its direct neighbours so it is never stranded alone.
        if (highlightIt) await expand(entity.id);
      }
      setSelected(entity.id);
      pushPath(entity.id);
      if (highlightIt) setHighlight(entity.id);
      centerSoon(entity.id, wasVisible ? 0 : 560);
    },
    [visible, reveal, expand, pushPath, centerSoon],
  );

  const resetView = () => {
    setHidden(new Set());
    setResetTick((t) => t + 1);
  };

  const toggleType = (t: EntityType) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const visibleEntities = graph.entities.filter((e) => !hidden.has(e.type));

  if (status === 'error' && error) {
    return (
      <div className="grid min-h-[60vh] place-items-center bg-midnight">
        <div className="rounded-xl bg-paper">
          <ErrorState error={error} onRetry={resetView} />
        </div>
      </div>
    );
  }

  const panel = (
    <GraphInfoPanel
      selectedId={selected}
      visibleIds={visible}
      visibleEntities={visibleEntities}
      onNavigate={(e) => void goTo(e)}
      onExpand={(id) => void expand(id)}
      onClose={() => setSelected(null)}
      onFit={() => handle.current?.fit()}
    />
  );

  return (
    <div className="relative flex h-[calc(100vh-3.5rem)] min-h-[560px] overflow-hidden bg-midnight">
      <div className="relative min-w-0 flex-1">
        <div className="grid-bg-dark absolute inset-0" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(67,198,182,0.07),transparent_60%)]" aria-hidden />

        {status === 'ready' ? (
          <GraphCanvas
            ref={handle}
            className="absolute inset-0"
            graph={graph}
            focusId={focusId}
            selectedId={selected}
            highlightId={highlight}
            hiddenTypes={hidden}
            onSelect={selectNode}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-sm text-slate-400" role="status">
            Building network…
          </div>
        )}

        {/* Top-left: search + selection path */}
        <div className="absolute left-4 top-4 z-10 flex max-w-[calc(100%-5.5rem)] flex-col gap-2.5">
          <GraphSearch onPick={(e) => void goTo(e, true)} />
          {path.length > 1 ? (
            <nav aria-label="Selection path" className="flex flex-wrap items-center gap-1 text-[11.5px]">
              <span className="eyebrow !text-slate-500 mr-1">Path</span>
              {path.map((id, i) => {
                const e = entities.get(id);
                const last = i === path.length - 1;
                return (
                  <span key={`${id}-${i}`} className="flex items-center gap-1">
                    {i > 0 ? <ChevronRight size={11} className="text-slate-600" aria-hidden /> : null}
                    <button
                      type="button"
                      onClick={() => {
                        setPath((p) => p.slice(0, i + 1));
                        setSelected(id);
                        centerSoon(id);
                      }}
                      aria-current={last ? 'true' : undefined}
                      className={`max-w-[130px] truncate rounded px-1.5 py-0.5 font-semibold ${
                        last ? 'bg-midnight-3 text-white' : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      {e?.name ?? id}
                    </button>
                  </span>
                );
              })}
            </nav>
          ) : null}
        </div>

        {/* Top-right: view controls */}
        <div className="absolute right-4 top-4 z-10 flex flex-col gap-1.5">
          <ControlButton label="Zoom in" onClick={() => handle.current?.zoomBy(1.3)}>
            <ZoomIn size={16} />
          </ControlButton>
          <ControlButton label="Zoom out" onClick={() => handle.current?.zoomBy(1 / 1.3)}>
            <ZoomOut size={16} />
          </ControlButton>
          <ControlButton label="Fit to screen" onClick={() => handle.current?.fit()}>
            <Maximize size={16} />
          </ControlButton>
          <ControlButton label="Re-arrange layout" onClick={() => handle.current?.relayout()}>
            <Shuffle size={16} />
          </ControlButton>
          <ControlButton label="Reset view" onClick={resetView}>
            <RotateCcw size={16} />
          </ControlButton>
        </div>

        {/* Bottom: legend + filters */}
        <div className="absolute inset-x-4 bottom-4 z-10 flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={() => setLegendOpen((o) => !o)}
            aria-expanded={legendOpen}
            className="btn-dark !py-1 text-[12px] sm:hidden"
          >
            <Layers size={13} aria-hidden /> Legend &amp; filters
          </button>
          <div className={`${legendOpen ? 'block' : 'hidden'} w-full sm:block`}>
            <GraphLegend hidden={hidden} onToggle={toggleType} counts={counts} />
          </div>
        </div>
      </div>

      {/* Desktop info panel */}
      <aside
        aria-label="Entity information"
        className="hidden w-[360px] shrink-0 flex-col border-l border-midnight-line bg-midnight-2 text-slate-200 md:flex"
      >
        <div className="scroll-thin scroll-thin-dark min-h-0 flex-1 overflow-y-auto">{panel}</div>
      </aside>

      {/* Mobile bottom sheet */}
      {selected ? (
        <aside
          aria-label="Entity information"
          className="absolute inset-x-0 bottom-0 z-20 max-h-[62%] overflow-hidden rounded-t-2xl border-t border-midnight-line bg-midnight-2 text-slate-200 shadow-lift md:hidden"
        >
          <div className="scroll-thin scroll-thin-dark max-h-[62vh] overflow-y-auto">{panel}</div>
        </aside>
      ) : null}
    </div>
  );
}
