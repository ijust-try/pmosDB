import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-1.5 text-[28px] font-extrabold leading-tight tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionTitle({ eyebrow, title, aside }: { eyebrow?: string; title: string; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 className="mt-0.5 text-lg font-bold tracking-tight text-ink">{title}</h2>
      </div>
      {aside}
    </div>
  );
}

export function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber/25 bg-amber-soft/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber">
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" aria-hidden />
      <p>{children}</p>
    </div>
  );
}
