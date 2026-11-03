import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { parseMarkdown } from '../../utils/markdown';
import type { Inline } from '../../utils/markdown';

function Inlines({ tokens, onNavigate }: { tokens: Inline[]; onNavigate: () => void }) {
  return (
    <>
      {tokens.map((t, i) => {
        switch (t.kind) {
          case 'bold':
            return (
              <strong key={i} className="font-bold text-ink">
                <Inlines tokens={t.inner} onNavigate={onNavigate} />
              </strong>
            );
          case 'cite':
            return (
              <span key={i} className="ml-0.5 whitespace-nowrap font-mono text-[10.5px] font-semibold text-accent" title="Source record">
                [{t.refs.join(', ')}]
              </span>
            );
          case 'link':
            return t.external ? (
              <a
                key={i}
                href={t.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-baseline gap-0.5 font-semibold text-accent underline-offset-2 hover:underline"
              >
                {t.text}
                <ExternalLink size={10} aria-hidden className="translate-y-px" />
              </a>
            ) : (
              <Link key={i} to={t.href} onClick={onNavigate} className="font-semibold text-accent underline-offset-2 hover:underline">
                {t.text}
              </Link>
            );
          default:
            return <span key={i}>{t.text}</span>;
        }
      })}
    </>
  );
}

/** Renders the safe markdown subset as React elements. Nothing from the answer is ever injected as HTML. */
export function ChatMarkdown({ text, onNavigate }: { text: string; onNavigate: () => void }) {
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed text-ink-soft">
      {parseMarkdown(text).map((block, i) =>
        block.kind === 'list' ? (
          <ul key={i} className="space-y-1.5 border-l-2 border-line pl-3">
            {block.items.map((item, j) => (
              <li key={j}>
                <Inlines tokens={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            <Inlines tokens={block.inline} onNavigate={onNavigate} />
          </p>
        ),
      )}
    </div>
  );
}
