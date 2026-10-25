import { AlertOctagon, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function LoadingRows({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-2.5 w-2/3" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-sand text-ink-mute">
        {icon ?? <SearchX size={20} aria-hidden />}
      </div>
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {body ? <p className="mt-1 max-w-sm text-sm text-ink-mute">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div role="alert" className="grid place-items-center px-6 py-14 text-center">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-rose-soft text-rose">
        <AlertOctagon size={20} aria-hidden />
      </div>
      <h3 className="text-sm font-bold text-ink">Could not load this data</h3>
      <p className="mt-1 max-w-md text-sm text-ink-mute">{error.message}</p>
      {onRetry ? (
        <button type="button" className="btn-ghost mt-4" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** Wraps the common loading / error / empty branching for a useAsync result. */
export function AsyncBoundary<T>({
  state,
  children,
  loading,
}: {
  state: { data: T | undefined; loading: boolean; error: Error | undefined; reload: () => void };
  children: (data: T) => ReactNode;
  loading?: ReactNode;
}) {
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (state.loading && state.data === undefined) return <>{loading ?? <LoadingRows />}</>;
  if (state.data === undefined) return null;
  return <>{children(state.data)}</>;
}
