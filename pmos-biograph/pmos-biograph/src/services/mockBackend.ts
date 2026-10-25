import { DATA_SOURCES, ENTITIES, RELATIONSHIPS } from '../data/mock';
import type {
  Entity,
  EntityType,
  GraphData,
  ListItem,
  ListQuery,
  Neighbour,
  Pathway,
  Publication,
  PublicationItem,
  PublicationQuery,
  SearchHit,
  SearchOptions,
  Therapeutic,
} from '../types';
import { apiConfig } from './api.config';
import type { Backend } from './backend';

const delay = <T>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), apiConfig.mockLatencyMs));

const byId = new Map(ENTITIES.map((e) => [e.id, e]));

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

function identifiersOf(e: Entity): string[] {
  return [e.primaryId, ...e.sources.map((s) => s.accession ?? '')].filter(Boolean);
}

function scoreEntity(e: Entity, q: string): SearchHit | null {
  const name = norm(e.name);
  let best: SearchHit | null = null;
  const consider = (score: number, matchedOn: SearchHit['matchedOn']) => {
    if (!best || score > best.score) best = { entity: e, score, matchedOn };
  };

  if (name === q) consider(100, 'name');
  else if (name.startsWith(q)) consider(82, 'name');
  else if (name.includes(q)) consider(62, 'name');

  for (const alias of e.aliases) {
    const a = norm(alias);
    if (a === q) consider(92, 'alias');
    else if (a.startsWith(q)) consider(72, 'alias');
    else if (a.includes(q)) consider(52, 'alias');
  }
  for (const id of identifiersOf(e)) {
    const i = norm(id);
    if (i === q) consider(96, 'identifier');
    else if (i.includes(q) && q.length >= 2) consider(55, 'identifier');
  }
  if (norm(e.description).includes(q)) consider(22, 'description');

  if (!best) {
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) {
      const hay = norm([e.name, ...e.aliases, ...identifiersOf(e), e.description].join(' '));
      if (tokens.every((t) => hay.includes(t))) consider(30, 'description');
    }
  }
  return best;
}

function relationshipCount(id: string) {
  return RELATIONSHIPS.filter((r) => r.source === id || r.target === id).length;
}

function neighboursOf(id: string): Neighbour[] {
  const out: Neighbour[] = [];
  for (const r of RELATIONSHIPS) {
    if (r.source === id) {
      const entity = byId.get(r.target);
      if (entity) out.push({ entity, relationship: r, direction: 'out' });
    } else if (r.target === id) {
      const entity = byId.get(r.source);
      if (entity) out.push({ entity, relationship: r, direction: 'in' });
    }
  }
  return out;
}

export const mockBackend: Backend = {
  async search(query: string, options: SearchOptions = {}) {
    const q = norm(query);
    if (!q) return delay([]);
    const hits = ENTITIES.filter(
      (e) =>
        (!options.types?.length || options.types.includes(e.type)) &&
        (!options.sources?.length || e.sources.some((s) => options.sources!.includes(s.source))),
    )
      .map((e) => scoreEntity(e, q))
      .filter((h): h is SearchHit => h !== null)
      .sort((a, b) => b.score - a.score || a.entity.name.localeCompare(b.entity.name));
    return delay(hits.slice(0, options.limit ?? 50));
  },

  async list(query: ListQuery) {
    const { types, sources, sortBy = 'name', sortDir = 'asc', page = 1, pageSize = 10 } = query;
    const q = norm(query.query ?? '');
    let items: ListItem[] = ENTITIES.filter(
      (e) =>
        (!types?.length || types.includes(e.type)) &&
        (!sources?.length || e.sources.some((s) => sources.includes(s.source))),
    )
      .map((e) => ({ entity: e, hit: q ? scoreEntity(e, q) : { score: 0 } }))
      .filter((x) => x.hit !== null)
      .map((x) => ({ entity: x.entity, relationshipCount: relationshipCount(x.entity.id) }));

    const dir = sortDir === 'asc' ? 1 : -1;
    items = items.sort((a, b) => {
      switch (sortBy) {
        case 'type':
          return dir * a.entity.type.localeCompare(b.entity.type) || a.entity.name.localeCompare(b.entity.name);
        case 'primaryId':
          return dir * a.entity.primaryId.localeCompare(b.entity.primaryId, undefined, { numeric: true });
        case 'relationships':
          return dir * (a.relationshipCount - b.relationshipCount) || a.entity.name.localeCompare(b.entity.name);
        default:
          return dir * a.entity.name.localeCompare(b.entity.name);
      }
    });
    const total = items.length;
    const start = (page - 1) * pageSize;
    return delay({ items: items.slice(start, start + pageSize), total, page, pageSize });
  },

  async getEntity(id: string) {
    return delay(byId.get(id) ?? null);
  },

  async getNeighbours(id: string) {
    return delay(neighboursOf(id));
  },

  async getGraph(focusId: string, depth: number): Promise<GraphData> {
    const seen = new Set<string>([focusId]);
    let frontier = [focusId];
    for (let d = 0; d < depth; d++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const n of neighboursOf(id)) {
          if (!seen.has(n.entity.id)) {
            seen.add(n.entity.id);
            next.push(n.entity.id);
          }
        }
      }
      frontier = next;
    }
    return delay({
      entities: ENTITIES.filter((e) => seen.has(e.id)),
      relationships: RELATIONSHIPS.filter((r) => seen.has(r.source) && seen.has(r.target)),
    });
  },

  async getPathways() {
    return delay(ENTITIES.filter((e): e is Pathway => e.type === 'pathway'));
  },

  async getTherapeutics() {
    return delay(ENTITIES.filter((e): e is Therapeutic => e.type === 'therapeutic'));
  },

  async getPublications(query: PublicationQuery = {}) {
    const q = norm(query.query ?? '');
    const pubs = ENTITIES.filter((e): e is Publication => e.type === 'publication');
    const items: PublicationItem[] = pubs
      .map((publication) => ({
        publication,
        entities: neighboursOf(publication.id).map((n) => n.entity),
      }))
      .filter(({ publication, entities }) => {
        if (q && !scoreEntity(publication, q)) return false;
        if (query.year !== undefined) {
          if (query.year === 'unknown' ? publication.year !== null : publication.year !== query.year) return false;
        }
        if (query.category && publication.evidenceCategory !== query.category) return false;
        if (query.entityId && !entities.some((e) => e.id === query.entityId)) return false;
        return true;
      });
    return delay(items);
  },

  async getSources() {
    return delay(DATA_SOURCES);
  },

  async getSummary() {
    const entityCounts = Object.fromEntries(
      (['gene', 'protein', 'hormone', 'biomarker', 'pathway', 'therapeutic', 'publication', 'process'] as EntityType[]).map(
        (t) => [t, ENTITIES.filter((e) => e.type === t).length],
      ),
    ) as Record<EntityType, number>;
    const validated = RELATIONSHIPS.filter((r) => r.status === 'project-document').length;
    return delay({
      entityCounts,
      relationshipCount: RELATIONSHIPS.length,
      validatedRelationshipCount: validated,
      unvalidatedRelationshipCount: RELATIONSHIPS.length - validated,
      unverifiedIdentifierCount: ENTITIES.filter((e) => e.verification === 'unverified-demo').length,
    });
  },
};
