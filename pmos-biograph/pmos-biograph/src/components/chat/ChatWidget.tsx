import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Box, Database, Eraser, FileText, MessageCircle, Search, Send, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiConfig } from '../../services/api.config';
import { askChat } from '../../services/chat';
import type { ChatResponse, FurtherReadingItem } from '../../services/chat';
import { safeHref } from '../../utils/markdown';
import { ChatMarkdown } from './ChatMarkdown';

const MAX_CHARS = 300;
const MAX_MESSAGES = 40;
const EXAMPLES = [
  'What is the full form of PMOS?',
  'Give me the link for the androgen receptor',
  'Which drugs target CYP19A1?',
  'Papers about hirsutism',
];

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  response?: ChatResponse;
  /** Set on a failed request: the question that can be retried. */
  retry?: string;
}

/** The record the visitor is looking at, so "this gene" or "its pathways" can be answered. */
function usePageContext(): string | null {
  const { pathname, search } = useLocation();
  return useMemo(() => {
    const entity = /^\/entity\/([^/]+)/.exec(pathname);
    if (entity) return decodeURIComponent(entity[1]);
    const params = new URLSearchParams(search);
    return params.get('p') ?? params.get('t') ?? params.get('focus');
  }, [pathname, search]);
}

const KIND_ICON = { paper: FileText, search: Search, structure: Box, database: Database } as const;

/** Research links picked from the records (never written by the model). Only safe URLs are rendered. */
function FurtherReading({ items, onNavigate }: { items: FurtherReadingItem[]; onNavigate: () => void }) {
  const safe = items.filter((item) => safeHref(item.url));
  if (safe.length === 0) return null;
  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <p className="eyebrow mb-1.5">Further reading</p>
      <ul className="space-y-1.5">
        {safe.map((item) => {
          const Icon = KIND_ICON[item.kind];
          const content = (
            <>
              <Icon size={12} className="mt-[3px] shrink-0 text-ink-mute" aria-hidden />
              <span>{item.label}</span>
            </>
          );
          const className = 'flex items-start gap-1.5 text-[12.5px] font-semibold leading-snug text-teal hover:underline';
          return (
            <li key={item.url}>
              {item.external ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer" className={className}>
                  {content}
                </a>
              ) : (
                <Link to={item.url} onClick={onNavigate} className={className}>
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ResponseFooter({ response }: { response: ChatResponse }) {
  if (response.intent === 'help') return null;
  return (
    <div className="mt-2.5 space-y-1.5">
      {response.status === 'ok' ? (
        <p className="flex items-center gap-1.5 text-[11px] text-ink-mute">
          {response.mode === 'model' ? (
            <>
              <Sparkles size={11} aria-hidden /> Written by AI from {response.citations.length} cited record
              {response.citations.length === 1 ? '' : 's'} and checked against them
            </>
          ) : (
            <>
              <Database size={11} aria-hidden /> Answered directly from the records
            </>
          )}
        </p>
      ) : null}
      {response.notice ? <p className="text-[11.5px] leading-snug text-amber">{response.notice}</p> : null}
    </div>
  );
}

function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastContext, setLastContext] = useState<string | null>(null);
  const pageContext = usePageContext();
  const nextId = useRef(1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else if (wasOpen.current) buttonRef.current?.focus(); // closing: hand focus back to the launcher
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, loading, open]);

  const add = useCallback((message: Omit<Message, 'id'>) => {
    setMessages((prev) => [...prev, { ...message, id: nextId.current++ }].slice(-MAX_MESSAGES));
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim().slice(0, MAX_CHARS);
      if (!question || loading) return;
      setInput('');
      add({ role: 'user', text: question });
      setLoading(true);
      try {
        const response = await askChat(question, pageContext ?? lastContext);
        setLastContext(response.context ?? null);
        add({ role: 'assistant', text: response.answer, response });
      } catch (err) {
        add({ role: 'assistant', text: err instanceof Error ? err.message : 'Something went wrong.', retry: question });
      } finally {
        setLoading(false);
      }
    },
    [add, loading, pageContext, lastContext],
  );

  const close = () => setOpen(false);
  const leaveOnSmallScreens = () => {
    if (window.matchMedia('(max-width: 639px)').matches) setOpen(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[60] print:hidden">
      <AnimatePresence>
        {open ? (
          <motion.section
            key="panel"
            role="dialog"
            aria-label="Ask the PMOS knowledge base"
            onKeyDown={(e) => e.key === 'Escape' && close()}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="flex h-[min(620px,calc(100dvh-5.5rem))] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-line bg-paper shadow-lift sm:w-[410px]"
          >
            <header className="flex items-center gap-3 bg-midnight px-4 py-3 text-white">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-midnight-3 text-teal-bright">
                <MessageCircle size={16} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-extrabold leading-tight">Ask the knowledge base</h2>
                <p className="truncate text-[11px] text-slate-400">Answers come only from sourced records</p>
              </div>
              {messages.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setLastContext(null);
                  }}
                  aria-label="Clear the conversation"
                  title="Clear the conversation"
                  className="rounded-md p-1.5 text-slate-400 hover:bg-midnight-3 hover:text-white"
                >
                  <Eraser size={15} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={close}
                aria-label="Close the assistant"
                className="rounded-md p-1.5 text-slate-400 hover:bg-midnight-3 hover:text-white"
              >
                <X size={16} />
              </button>
            </header>

            <div role="log" aria-live="polite" aria-label="Conversation" className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-[13.5px] leading-relaxed text-ink-soft">
                    Ask about genes, proteins, pathways, compounds and papers. I answer only from the recorded data and link to the
                    source of every record. I can also give you links and identifiers.
                    {pageContext ? ' You can say "this" to mean the page you are on.' : ''}
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {EXAMPLES.map((example) => (
                      <li key={example}>
                        <button
                          type="button"
                          onClick={() => void send(example)}
                          className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-teal hover:text-teal"
                        >
                          {example}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-midnight px-3.5 py-2 text-[13.5px] leading-relaxed text-white">
                      {m.text}
                    </p>
                  </div>
                ) : (
                  <div key={m.id} className="flex">
                    <div className="max-w-[94%] rounded-2xl rounded-bl-md border border-line bg-white px-3.5 py-3 shadow-card">
                      {m.retry ? (
                        <div className="space-y-2">
                          <p className="flex items-start gap-1.5 text-[13px] leading-snug text-rose">
                            <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden /> {m.text}
                          </p>
                          <button
                            type="button"
                            onClick={() => void send(m.retry as string)}
                            disabled={loading}
                            className="text-[12.5px] font-bold text-teal hover:underline disabled:opacity-50"
                          >
                            Try again
                          </button>
                        </div>
                      ) : (
                        <>
                          <ChatMarkdown text={m.text} onNavigate={leaveOnSmallScreens} />
                          {m.response ? <ResponseFooter response={m.response} /> : null}
                          {m.response?.furtherReading?.length ? (
                            <FurtherReading items={m.response.furtherReading} onNavigate={leaveOnSmallScreens} />
                          ) : null}
                          {m.response && m.response.status !== 'ok' && m.response.suggestions.length > 0 ? (
                            <div className="mt-3 border-t border-line pt-2.5">
                              <p className="eyebrow mb-1.5">You could open</p>
                              <ul className="flex flex-wrap gap-1.5">
                                {m.response.suggestions.map((s) => (
                                  <li key={s.url + s.name}>
                                    <Link
                                      to={s.url}
                                      title={s.name}
                                      onClick={leaveOnSmallScreens}
                                      className="inline-block max-w-[16rem] truncate rounded-md border border-line bg-paper px-2 py-1 align-bottom text-[12px] font-semibold text-ink-soft hover:border-teal hover:text-teal"
                                    >
                                      {s.name}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                ),
              )}

              {loading ? (
                <div className="flex" role="status">
                  <p className="rounded-2xl rounded-bl-md border border-line bg-white px-3.5 py-2.5 text-[13px] text-ink-mute shadow-card">
                    Looking through the records…
                  </p>
                </div>
              ) : null}
              <div ref={endRef} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="border-t border-line bg-white p-3"
            >
              <div className="flex items-end gap-2">
                <label htmlFor="chat-input" className="sr-only">
                  Your question
                </label>
                <textarea
                  id="chat-input"
                  ref={inputRef}
                  value={input}
                  maxLength={MAX_CHARS}
                  rows={2}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  placeholder="Ask a question…"
                  className="min-h-[2.75rem] flex-1 resize-none rounded-lg border border-line bg-paper px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-teal"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  aria-label="Send question"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-teal text-white transition-colors hover:bg-teal/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send size={16} />
                </button>
              </div>
              <p className="mt-2 flex justify-between gap-2 text-[11px] leading-snug text-ink-mute">
                <span>Research information only, not medical advice.</span>
                {input.length > MAX_CHARS - 60 ? (
                  <span className="shrink-0 font-mono">
                    {input.length}/{MAX_CHARS}
                  </span>
                ) : null}
              </p>
            </form>
          </motion.section>
        ) : (
          <motion.button
            key="launcher"
            ref={buttonRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open the assistant: ask the knowledge base"
            aria-expanded={false}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.14 }}
            className="flex items-center gap-2 rounded-full bg-midnight py-3 pl-4 pr-5 text-sm font-bold text-white shadow-lift transition-colors hover:bg-midnight-3"
          >
            <MessageCircle size={18} className="text-teal-bright" aria-hidden />
            Ask
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The assistant needs the API, so it is not offered on the offline demo dataset. */
export function ChatWidget() {
  if (apiConfig.useMock) return null;
  return <ChatPanel />;
}
