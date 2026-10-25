import { useNavigate } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { getGraphNeighbourhood } from '../../services/repository';
import { ErrorState } from '../ui/States';
import { GraphCanvas } from './GraphCanvas';

/** Small, static neighbourhood preview. Clicking a node opens its dossier. */
export function MiniGraph({
  focusId,
  depth = 2,
  className = 'h-72',
  interactive = false,
}: {
  focusId: string;
  depth?: number;
  className?: string;
  interactive?: boolean;
}) {
  const navigate = useNavigate();
  const state = useAsync(() => getGraphNeighbourhood(focusId, depth), [focusId, depth]);

  return (
    <div className={`relative overflow-hidden rounded-xl bg-midnight ${className}`}>
      <div className="grid-bg-dark absolute inset-0" aria-hidden />
      {state.error ? (
        <ErrorState error={state.error} onRetry={state.reload} />
      ) : state.data ? (
        state.data.entities.length > 1 ? (
          <GraphCanvas
            graph={state.data}
            focusId={focusId}
            interactive={interactive}
            nodeScale={interactive ? 1 : 0.85}
            className="absolute inset-0"
            onSelect={(id) => {
              if (id && id !== focusId) navigate(`/entity/${id}`);
            }}
          />
        ) : (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-[13px] text-slate-400">
            No connected entities recorded in the demo dataset.
          </p>
        )
      ) : (
        <div className="absolute inset-0 grid place-items-center text-[12px] text-slate-500" role="status">
          Loading network…
        </div>
      )}
    </div>
  );
}
