import cytoscape, { type Core, type ElementDefinition, type NodeSingular } from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Entity, EntityType, GraphData } from '../../types';
import { ENTITY_META } from '../../utils/entityMeta';

export interface GraphHandle {
  fit: () => void;
  relayout: () => void;
  centerOn: (id: string) => void;
  zoomBy: (factor: number) => void;
}

interface Props {
  graph: GraphData;
  focusId: string;
  selectedId?: string | null;
  highlightId?: string | null;
  hiddenTypes?: ReadonlySet<EntityType>;
  onSelect?: (id: string | null) => void;
  /** When false the canvas is a static preview: no pan/zoom/drag, no edge labels. */
  interactive?: boolean;
  nodeScale?: number;
  className?: string;
}

export function graphLabel(e: Entity): string {
  let label = e.name;
  if (e.type === 'protein' && e.geneSymbol) label = `${e.geneSymbol} protein`;
  if (e.type === 'publication') label = 'Publication · ' + (e.name.match(/^[A-Z0-9]+ rs\d+/)?.[0] ?? e.name);
  return label.length > 30 ? `${label.slice(0, 28)}…` : label;
}

cytoscape.use(fcose);

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function buildStyle(interactive: boolean, scale: number): cytoscape.StylesheetJson {
  const fs = interactive ? 11 : 9;
  return [
    {
      selector: 'node',
      style: {
        shape: 'data(shape)' as never,
        'background-color': 'data(color)',
        'background-opacity': 0.92,
        width: 30 * scale,
        height: 30 * scale,
        'border-width': 2,
        'border-color': '#0A1330',
        label: 'data(label)',
        color: '#DCE3F6',
        'font-family': '"Manrope Variable", Manrope, system-ui, sans-serif',
        'font-size': fs,
        'font-weight': 600,
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 7,
        'text-wrap': 'wrap',
        'text-max-width': '110px',
        'text-outline-color': '#0A1330',
        'text-outline-width': 3,
        'min-zoomed-font-size': 6,
        'transition-property': 'opacity, border-color, border-width',
        'transition-duration': 160,
      } as never,
    },
    { selector: 'node.focus', style: { width: 42 * scale, height: 42 * scale, 'font-size': fs + 1, 'font-weight': 800 } as never },
    {
      selector: 'node.found',
      style: { 'underlay-color': '#43C6B6', 'underlay-opacity': 0.28, 'underlay-padding': 10, 'underlay-shape': 'ellipse' } as never,
    },
    {
      selector: 'node.sel',
      style: { 'border-color': '#FFFFFF', 'border-width': 3, 'underlay-color': '#FFFFFF', 'underlay-opacity': 0.14, 'underlay-padding': 9 } as never,
    },
    { selector: 'node.dim', style: { opacity: 0.35 } },
    {
      selector: 'edge',
      style: {
        width: 1.4,
        'line-color': '#34468A',
        'target-arrow-color': '#34468A',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8,
        'curve-style': 'bezier',
        label: interactive ? 'data(label)' : '',
        'font-family': '"IBM Plex Mono", monospace',
        'font-size': 8.5,
        color: '#8C9AC8',
        'text-rotation': 'autorotate',
        'text-background-color': '#0A1330',
        'text-background-opacity': 1,
        'text-background-padding': '2px',
        'min-zoomed-font-size': 7,
        'transition-property': 'opacity, line-color',
        'transition-duration': 160,
      } as never,
    },
    { selector: 'edge[status = "demo-unvalidated"]', style: { 'line-style': 'dashed', 'line-dash-pattern': [5, 4] } as never },
    { selector: 'edge.hl', style: { 'line-color': '#7C8FE0', 'target-arrow-color': '#7C8FE0', width: 2, color: '#C5CFF5', 'z-index': 9 } as never },
    { selector: 'edge.dim', style: { opacity: 0.12 } },
    { selector: '.hidden', style: { display: 'none' } },
  ] as cytoscape.StylesheetJson;
}

function toElements(graph: GraphData, focusId: string): ElementDefinition[] {
  const ids = new Set(graph.entities.map((e) => e.id));
  const nodes: ElementDefinition[] = graph.entities.map((e) => ({
    group: 'nodes',
    data: {
      id: e.id,
      label: graphLabel(e),
      type: e.type,
      color: ENTITY_META[e.type].graph,
      shape: ENTITY_META[e.type].shape,
    },
    classes: e.id === focusId ? 'focus' : '',
  }));
  const edges: ElementDefinition[] = graph.relationships
    .filter((r) => ids.has(r.source) && ids.has(r.target))
    .map((r) => ({
      group: 'edges',
      data: { id: r.id, source: r.source, target: r.target, label: r.label, status: r.status },
    }));
  return [...nodes, ...edges];
}

/** Deterministic seed: concentric rings by graph distance from the focus entity. */
function seedPositions(cy: Core, focusId: string, interactive: boolean) {
  const focus = cy.getElementById(focusId);
  const dist = new Map<string, number>();
  if (focus.nonempty()) {
    dist.set(focusId, 0);
    let frontier: NodeSingular[] = [focus as NodeSingular];
    while (frontier.length) {
      const next: NodeSingular[] = [];
      for (const n of frontier) {
        n.neighborhood('node').forEach((m) => {
          if (!dist.has(m.id())) {
            dist.set(m.id(), dist.get(n.id())! + 1);
            next.push(m as NodeSingular);
          }
        });
      }
      frontier = next;
    }
  }
  const maxD = Math.max(0, ...dist.values());
  cy.layout({
    name: 'concentric',
    concentric: (n: NodeSingular) => 100 - (dist.get(n.id()) ?? maxD + 1),
    levelWidth: () => 1,
    minNodeSpacing: interactive ? 70 : 40,
    animate: false,
    fit: false,
  } as cytoscape.LayoutOptions).run();
}

type LayoutMode = 'initial' | 'incremental' | 'shuffle';

const fitPadding = (cy: Core, interactive: boolean) =>
  interactive ? Math.max(28, Math.min(90, cy.width() * 0.08, cy.height() * 0.1)) : 24;

function runLayout(cy: Core, focusId: string, mode: LayoutMode, interactive: boolean) {
  if (mode === 'initial') seedPositions(cy, focusId, interactive);
  cy.layout({
    name: 'fcose',
    randomize: mode === 'shuffle',
    animate: mode !== 'initial' && !prefersReducedMotion(),
    animationDuration: 520,
    fit: true,
    padding: fitPadding(cy, interactive),
    nodeDimensionsIncludeLabels: true,
    uniformNodeDimensions: false,
    packComponents: true,
    quality: 'default',
    nodeRepulsion: () => (interactive ? 6500 : 3500),
    idealEdgeLength: () => (interactive ? 100 : 70),
    edgeElasticity: () => 0.4,
    nodeSeparation: interactive ? 60 : 40,
    gravity: 0.3,
    numIter: 2500,
  } as unknown as cytoscape.LayoutOptions).run();
  if (mode === 'initial') {
    matchAspect(cy);
    cy.fit(cy.elements(':visible'), fitPadding(cy, interactive));
  }
}

/** Stretch the layout along one axis so it fills wide/short (or tall/narrow) frames instead of shrinking to fit. */
function matchAspect(cy: Core) {
  const nodes = cy.nodes();
  if (nodes.length < 3 || cy.height() === 0) return;
  const bb = nodes.boundingBox();
  if (bb.w === 0 || bb.h === 0) return;
  const ratio = cy.width() / cy.height() / (bb.w / bb.h);
  const cx = (bb.x1 + bb.x2) / 2;
  const cyy = (bb.y1 + bb.y2) / 2;
  if (ratio > 1.15) {
    const k = Math.min(ratio, 2.2);
    nodes.positions((n) => ({ x: cx + (n.position('x') - cx) * k, y: n.position('y') }));
  } else if (ratio < 0.87) {
    const k = Math.min(1 / ratio, 2.2);
    nodes.positions((n) => ({ x: n.position('x'), y: cyy + (n.position('y') - cyy) * k }));
  }
}

export const GraphCanvas = forwardRef<GraphHandle, Props>(function GraphCanvas(
  { graph, focusId, selectedId, highlightId, hiddenTypes, onSelect, interactive = true, nodeScale = 1, className = '' },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const signatureRef = useRef('');
  const touchedRef = useRef(false);
  const focusRef = useRef(focusId);
  focusRef.current = focusId;

  // Create the Cytoscape instance once.
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: buildStyle(interactive, nodeScale),
      minZoom: 0.25,
      maxZoom: 2.6,
      userZoomingEnabled: interactive,
      userPanningEnabled: interactive,
      boxSelectionEnabled: false,
      autoungrabify: !interactive,
    });
    cy.on('tap', 'node', (e) => onSelectRef.current?.(e.target.id()));
    cy.on('tap', (e) => {
      if (e.target === cy) onSelectRef.current?.(null);
    });
    cy.on('mouseover', 'node', () => {
      if (containerRef.current) containerRef.current.style.cursor = 'pointer';
    });
    cy.on('mouseout', 'node', () => {
      if (containerRef.current) containerRef.current.style.cursor = interactive ? 'grab' : 'default';
    });
    cy.on('userpanzoom dragfree', () => {
      touchedRef.current = true;
    });
    cyRef.current = cy;

    const ro = new ResizeObserver(() => {
      cy.resize();
      // Until the user pans/zooms, keep the whole graph framed as the container settles.
      if (!touchedRef.current && cy.elements().nonempty()) cy.fit(cy.elements(':visible'), fitPadding(cy, interactive));
    });
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      cy.destroy();
      cyRef.current = null;
      signatureRef.current = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync elements & layout whenever the visible graph changes.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const elements = toElements(graph, focusId);
    const signature = elements.map((e) => e.data.id).sort().join('|') + '@' + focusId;
    if (signature === signatureRef.current) return;
    const firstRun = signatureRef.current === '';
    signatureRef.current = signature;

    const wanted = new Set(elements.map((e) => e.data.id as string));
    cy.batch(() => {
      cy.elements().forEach((el) => {
        if (!wanted.has(el.id())) el.remove();
      });
      const added: string[] = [];
      elements.forEach((el) => {
        if (cy.getElementById(el.data.id as string).empty()) {
          cy.add(el);
          if (el.group === 'nodes') added.push(el.data.id as string);
        }
      });
      // New nodes start beside an existing neighbour so expansion looks organic.
      if (!firstRun) {
        added.forEach((id, i) => {
          const n = cy.getElementById(id) as NodeSingular;
          const anchor = n.neighborhood('node').filter((m) => !added.includes(m.id())).first() as NodeSingular;
          if (anchor.nonempty()) {
            const a = anchor.position();
            const angle = (i * 2 * Math.PI) / Math.max(added.length, 1);
            n.position({ x: a.x + Math.cos(angle) * 70, y: a.y + Math.sin(angle) * 70 });
          }
        });
      }
      cy.nodes().removeClass('focus');
      cy.getElementById(focusId).addClass('focus');
    });
    runLayout(cy, focusId, firstRun ? 'initial' : 'incremental', interactive);
  }, [graph, focusId, interactive]);

  // Type filters.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        n.toggleClass('hidden', !!hiddenTypes?.has(n.data('type') as EntityType));
      });
    });
  }, [hiddenTypes, graph]);

  // Selection emphasis.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass('dim hl sel');
      const node = selectedId ? cy.getElementById(selectedId) : null;
      if (node && node.nonempty()) {
        const hood = node.closedNeighborhood();
        cy.elements().not(hood).addClass('dim');
        node.addClass('sel');
        node.connectedEdges().addClass('hl');
      }
    });
  }, [selectedId, graph]);

  // Search highlight.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass('found');
    if (highlightId) {
      cy.getElementById(highlightId).addClass('found');
    }
  }, [highlightId, graph]);

  useImperativeHandle(
    ref,
    () => ({
      fit: () => {
        const cy = cyRef.current;
        if (!cy) return;
        touchedRef.current = false;
        const eles = cy.elements(':visible');
        cy.animate({ fit: { eles: eles.nonempty() ? eles : cy.elements(), padding: 70 }, duration: prefersReducedMotion() ? 0 : 320 });
      },
      relayout: () => {
        touchedRef.current = false;
        if (cyRef.current) runLayout(cyRef.current, focusRef.current, 'shuffle', interactive);
      },
      centerOn: (id: string) => {
        const cy = cyRef.current;
        if (!cy) return;
        const n = cy.getElementById(id);
        if (n.nonempty()) cy.animate({ center: { eles: n }, zoom: Math.max(cy.zoom(), 1), duration: prefersReducedMotion() ? 0 : 380 });
      },
      zoomBy: (factor: number) => {
        const cy = cyRef.current;
        if (!cy) return;
        cy.animate({
          zoom: { level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } },
          duration: prefersReducedMotion() ? 0 : 180,
        });
      },
    }),
    [interactive],
  );

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ cursor: interactive ? 'grab' : 'default' }}
      role="img"
      aria-label="Interactive biological knowledge graph canvas. Use the entity list in the side panel for keyboard access."
    />
  );
});
