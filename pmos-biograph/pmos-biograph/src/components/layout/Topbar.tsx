import { ChevronRight, Menu } from 'lucide-react';
import { Link, useLocation, useMatch } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { getDatasetStatus, getEntityById, getSyncStatus } from '../../services/repository';
import { CommandSearch } from './CommandSearch';

const TITLES: Record<string, string> = {
  '/': 'Overview',
  '/explore': 'Explore Entities',
  '/graph': 'BioGraph',
  '/pathways': 'Pathways',
  '/therapeutics': 'Therapeutics',
  '/evidence': 'Research & Evidence',
  '/sources': 'Data Sources',
  '/search': 'Search results',
};

function Breadcrumbs() {
  const { pathname } = useLocation();
  const entityMatch = useMatch('/entity/:id');
  const entityId = entityMatch?.params.id;
  const { data: entity } = useAsync(() => (entityId ? getEntityById(entityId) : Promise.resolve(null)), [entityId]);

  const crumbs: Array<{ label: string; to?: string }> = [{ label: 'PMOS', to: '/' }];
  if (entityId) {
    crumbs.push({ label: 'Explore Entities', to: '/explore' }, { label: entity?.name ?? 'Entity dossier' });
  } else {
    crumbs.push({ label: TITLES[pathname] ?? 'Not found' });
  }

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-[13px]">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} className={`flex min-w-0 items-center gap-1.5 ${i === 0 ? 'hidden sm:flex' : ''}`}>
              {i > 0 ? <ChevronRight size={13} className="hidden shrink-0 text-ink-faint sm:block" aria-hidden /> : null}
              {c.to && !last ? (
                <Link to={c.to} className="text-ink-mute hover:text-ink">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className="truncate font-bold text-ink">
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function DatasetIndicator() {
  const { data } = useAsync(() => getDatasetStatus(), []);
  const sync = useAsync(() => getSyncStatus(), []);
  if (!data) return null;
  const stale = sync.data?.stale === true;
  const demo = data.mode === 'demo' || stale;
  return (
    <Link
      to="/sources"
      title={stale ? 'The last successful data synchronisation is overdue.' : data.detail}
      className={`hidden items-center gap-2 rounded-full border px-3 py-1 text-[11.5px] font-semibold md:inline-flex ${
        demo ? 'border-amber/30 bg-amber-soft text-amber' : 'border-sage/30 bg-sage-soft text-sage'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${demo ? 'bg-amber' : 'bg-sage'}`} aria-hidden />
      {stale ? 'Data may be outdated' : data.label}
    </Link>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur lg:px-8">
      <button type="button" onClick={onMenu} aria-label="Open navigation" className="btn-ghost !px-2 lg:hidden">
        <Menu size={18} />
      </button>
      <div className="min-w-0 flex-1 lg:flex-none lg:basis-[28%]">
        <Breadcrumbs />
      </div>
      <div className="flex flex-1 justify-end">
        <CommandSearch />
      </div>
      <DatasetIndicator />
    </div>
  );
}
