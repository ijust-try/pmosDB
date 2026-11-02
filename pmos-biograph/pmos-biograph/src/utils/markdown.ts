/**
 * A deliberately tiny, safe markdown subset for chatbot answers: paragraphs, "- " lists, **bold**, [text](url)
 * links and [R1] citation markers. It returns data (never HTML); the UI turns it into React elements, so nothing
 * from a response can inject markup. Only site-relative links and https links are kept.
 */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; inner: Inline[] }
  | { kind: 'cite'; refs: string[] }
  | { kind: 'link'; text: string; href: string; external: boolean };

export type Block = { kind: 'paragraph'; inline: Inline[] } | { kind: 'list'; items: Inline[][] };

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|\[(R\d+(?:\s*[,;]\s*R\d+)*)\]/g;

/** Accepts `/path` and `https://…` only. Protocol-relative (`//host`), `http:`, `javascript:` and `data:` are refused. */
export function safeHref(href: string): { href: string; external: boolean } | null {
  if (/^\/(?!\/)\S*$/.test(href)) return { href, external: false };
  try {
    const url = new URL(href);
    if (url.protocol === 'https:') return { href: url.href, external: true };
  } catch {
    // not a URL
  }
  return null;
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ kind: 'text', text: text.slice(last, start) });
    if (m[1] !== undefined) {
      out.push({ kind: 'bold', inner: parseInline(m[1]) }); // a bold span may wrap a link: **[Name](/entity/x)**
    } else if (m[2] !== undefined) {
      const safe = safeHref(m[3]);
      out.push(safe ? { kind: 'link', text: m[2], ...safe } : { kind: 'text', text: m[2] });
    } else {
      out.push({ kind: 'cite', refs: m[4].split(/\s*[,;]\s*/) });
    }
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  let list: Inline[][] | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (item) {
      if (!list) {
        list = [];
        blocks.push({ kind: 'list', items: list });
      }
      list.push(parseInline(item[1]));
      continue;
    }
    list = null;
    if (line) blocks.push({ kind: 'paragraph', inline: parseInline(line) });
  }
  return blocks;
}
