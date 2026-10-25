/**
 * Single place for backend integration settings.
 *
 * To connect the real backend:
 *   1. Set VITE_USE_MOCK=false and VITE_API_BASE_URL in `.env`.
 *   2. Confirm the endpoint paths below match the real API.
 *   3. Adjust `src/services/normalisers.ts` so responses map onto `src/types`.
 */
export const apiConfig = {
  baseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000/api',
  useMock: ((import.meta.env.VITE_USE_MOCK as string | undefined) ?? 'true') !== 'false',
  mockLatencyMs: Number((import.meta.env.VITE_MOCK_LATENCY_MS as string | undefined) ?? 160),
  timeoutMs: 15000,
  /** Assumed REST contract. Change freely: nothing outside `remoteBackend.ts` reads these. */
  endpoints: {
    search: '/search',
    entities: '/entities',
    entity: (id: string) => `/entities/${encodeURIComponent(id)}`,
    neighbours: (id: string) => `/entities/${encodeURIComponent(id)}/relationships`,
    graph: '/graph',
    pathways: '/pathways',
    therapeutics: '/therapeutics',
    publications: '/publications',
    sources: '/sources',
    summary: '/summary',
  },
} as const;
