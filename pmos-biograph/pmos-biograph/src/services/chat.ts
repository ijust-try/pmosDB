/**
 * Chat API client. The backend answers every question from the knowledge base: either straight from the records
 * (`mode: 'database'`) or with a generated answer that passed verification (`mode: 'model'`).
 */
import { apiConfig } from './api.config';

export interface ChatRecord {
  ref: string;
  id: string;
  type: string;
  name: string;
  url: string;
  via: string | null;
  external: Array<{ source: string; url: string; accession: string | null }>;
}

export interface ChatSuggestion {
  id: string | null;
  type: string | null;
  name: string;
  url: string;
}

export interface ChatResponse {
  answer: string;
  mode: 'model' | 'database';
  status: 'ok' | 'refused' | 'no_evidence';
  intent: string;
  records: ChatRecord[];
  citations: string[];
  suggestions: ChatSuggestion[];
  unmatchedTerms: string[];
  notice: string | null;
  /** Record the answer was about; sent back as context so follow-ups like "its pathways" resolve. */
  context?: string | null;
}

export class ChatError extends Error {
  readonly kind: 'rate' | 'network' | 'server';
  constructor(kind: ChatError['kind'], message: string) {
    super(message);
    this.name = 'ChatError';
    this.kind = kind;
  }
}

const TIMEOUT_MS = 40_000;

export async function askChat(question: string, context: string | null, signal?: AbortSignal): Promise<ChatResponse> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  signal?.addEventListener('abort', () => timeout.abort(), { once: true });
  try {
    const res = await fetch(`${apiConfig.baseUrl.replace(/\/$/, '')}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ question, context }),
      signal: timeout.signal,
    });
    if (res.status === 429) throw new ChatError('rate', 'You are asking quickly. Please wait a minute and try again.');
    if (!res.ok) throw new ChatError('server', 'The assistant could not answer right now. Please try again in a moment.');
    const data = (await res.json()) as Partial<ChatResponse>;
    if (typeof data.answer !== 'string') throw new ChatError('server', 'The assistant sent an unexpected reply.');
    return {
      records: [],
      citations: [],
      suggestions: [],
      unmatchedTerms: [],
      notice: null,
      mode: 'database',
      status: 'ok',
      intent: 'qa',
      ...data,
    } as ChatResponse;
  } catch (err) {
    if (err instanceof ChatError) throw err;
    if (signal?.aborted) throw err;
    throw new ChatError('network', 'Could not reach the assistant. Please check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
}
