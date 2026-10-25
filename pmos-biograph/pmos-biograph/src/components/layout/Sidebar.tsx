import { NavLink } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { getDatasetStatus } from '../../services/repository';
import { Wordmark } from './Logo';
import { NAV_ITEMS } from './navItems';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { data: status } = useAsync(() => getDatasetStatus(), []);
  const isLive = status?.mode === 'live';
  return (
    <div className="flex h-full flex-col bg-midnight text-slate-300">
      <div className="px-5 pb-6 pt-5">
        <Wordmark />
      </div>
      <nav aria-label="Primary" className="flex-1 space-y-0.5 px-3">
        <p className="eyebrow !text-slate-500 px-2 pb-2">Workspace</p>
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors ${
                isActive ? 'bg-midnight-3 text-white' : 'text-slate-400 hover:bg-midnight-2 hover:text-slate-100'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive ? <span className="absolute -left-3 top-2 h-5 w-[3px] rounded-r bg-teal-bright" aria-hidden /> : null}
                <Icon size={17} strokeWidth={isActive ? 2.3 : 1.9} aria-hidden />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 rounded-lg border border-midnight-line bg-midnight-2/70 p-3.5">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-teal-bright' : 'bg-amber-soft'}`} aria-hidden />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-slate-300">
            {isLive ? 'Live build' : 'Demo build'}
          </span>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
          {isLive
            ? 'Interface reading from the FK-stitched relational database via the local PMOS API.'
            : 'Interface running on an illustrative dataset. Backend and relational database integration is pending.'}
        </p>
      </div>
    </div>
  );
}
