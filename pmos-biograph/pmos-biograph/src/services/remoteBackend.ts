/**
 * REAL BACKEND ADAPTER (inactive while VITE_USE_MOCK=true).
 *
 * This is where HTTP calls to the API (which will in turn query the relational database)
 * are made. Each method issues a request to an endpoint declared in `api.config.ts` and
 * passes the payload through a normaliser.
 */
import type { Pathway, Therapeutic } from '../types';
import { apiConfig } from './api.config';
import type { Backend } from './backend';
import {
  normaliseEntity,
  normaliseGraph,
  normaliseListPage,
  normaliseNeighbour,
  normalisePublicationItem,
  normaliseSearchHit,
  normaliseSource,
  normaliseSummary,
  normaliseSyncStatus,
} from './normalisers';

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const url = new URL(apiConfig.baseUrl.replace(/\/$/, '') + path, window.location.origin);
  Object.entries(params ?? {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), apiConfig.timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new ApiError(`Backend responded ${res.status} for ${path}`, res.status);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Could not load data right now. Please check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
}

const list = <T>(raw: unknown, fn: (x: unknown) => T): T[] => (Array.isArray(raw) ? raw.map(fn) : []);
const { endpoints: ep } = apiConfig;

export const remoteBackend: Backend = {
  async search(query, options = {}) {
    const raw = await get<unknown>(ep.search, { q: query, types: options.types, sources: options.sources, limit: options.limit });
    return list(raw, normaliseSearchHit);
  },
  async list(query) {
    return normaliseListPage(await get(ep.entities, { ...query }));
  },
  async getEntity(id) {
    try {
      return normaliseEntity(await get(ep.entity(id)));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  async getNeighbours(id) {
    return list(await get<unknown>(ep.neighbours(id)), normaliseNeighbour);
  },
  async getGraph(focusId, depth) {
    return normaliseGraph(await get(ep.graph, { focus: focusId, depth }));
  },
  async getPathways() {
    return list(await get<unknown>(ep.pathways), normaliseEntity) as Pathway[];
  },
  async getTherapeutics() {
    return list(await get<unknown>(ep.therapeutics), normaliseEntity) as Therapeutic[];
  },
  async getPublications(query = {}) {
    return list(await get<unknown>(ep.publications, { ...query }), normalisePublicationItem);
  },
  async getSources() {
    return list(await get<unknown>(ep.sources), normaliseSource);
  },
  async getSummary() {
    return normaliseSummary(await get(ep.summary));
  },
  async getSyncStatus() {
    return normaliseSyncStatus(await get(ep.sync));
  },
};
