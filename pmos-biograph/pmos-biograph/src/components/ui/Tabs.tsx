import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabDef {
  id: string;
  label: string;
  count?: number;
}

export function Tabs({
  tabs,
  active,
  onChange,
  dark = false,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  dark?: boolean;
}) {
  const uid = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKey = (e: KeyboardEvent, i: number) => {
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label="Sections" className={`flex gap-1 border-b ${dark ? 'border-midnight-line' : 'border-line'}`}>
      {tabs.map((t, i) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${uid}-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`${uid}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`-mb-px border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors ${
              selected
                ? 'border-teal text-ink'
                : 'border-transparent text-ink-mute hover:text-ink'
            }`}
          >
            {t.label}
            {t.count !== undefined ? (
              <span className="ml-1.5 rounded-full bg-sand-deep px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">{t.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, active, children }: { id: string; active: string; children: ReactNode }) {
  if (id !== active) return null;
  return (
    <div role="tabpanel" tabIndex={0}>
      {children}
    </div>
  );
}
