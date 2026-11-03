import { CalendarClock } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { getDatasetStatus } from '../../services/repository';
import { Wordmark } from './Logo';
import { NAV_ITEMS } from './navItems';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { data: status } = useAsync(() => getDatasetStatus(), []);
  const isLive = status?.mode === 'live';
  return (
    <div className="flex h-full flex-col border-r border-line bg-white text-ink-soft">
      <div className="px-5 pb-6 pt-5">
        <Wordmark />
      </div>
      <nav aria-label="Primary" className="scroll-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3">
        <p className="eyebrow px-2 pb-2">Workspace</p>
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors ${
                isActive ? 'bg-midnight text-white shadow-card' : 'text-ink-soft hover:bg-sand hover:text-ink'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={17} strokeWidth={isActive ? 2.3 : 1.9} aria-hidden />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 rounded-lg border border-line bg-paper p-3.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className={`absolute inset-0 rounded-full ${isLive ? 'bg-sage' : 'bg-amber'} animate-pulse-ring`} />
            <span className={`relative h-2 w-2 rounded-full ${isLive ? 'bg-sage' : 'bg-amber'}`} />
          </span>
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink">
            {isLive ? 'Live build' : 'Demo build'}
          </span>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-mute">
          {isLive
            ? 'Reading from the PMOS knowledge base, built from public biological databases.'
            : 'Running on an illustrative dataset. Backend and relational database integration is pending.'}
        </p>
        {isLive ? (
          <p className="mt-2 flex items-center gap-1.5 border-t border-line pt-2 text-[11.5px] font-semibold text-accent">
            <CalendarClock size={13} aria-hidden /> Refreshed every Wednesday
          </p>
        ) : null}
      </div>
    </div>
  );
}
