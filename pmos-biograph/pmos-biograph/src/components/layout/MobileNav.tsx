import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { NAV_ITEMS } from './navItems';

/**
 * Phone navigation: every section in one sticky, swipeable row under the top bar, so no section (Therapeutics, say)
 * sits behind a menu or at the bottom of a page. Hidden on large screens, where the sidebar does this job.
 */
export function MobileNav() {
  const { pathname } = useLocation();
  const rowRef = useRef<HTMLUListElement>(null);

  // keep the current section in view when the page changes
  useEffect(() => {
    const active = rowRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [pathname]);

  return (
    <nav
      aria-label="Sections"
      className="sticky top-14 z-20 h-11 border-b border-line bg-white/90 backdrop-blur lg:hidden"
    >
      <ul ref={rowRef} className="scroll-thin flex h-full items-center gap-1.5 overflow-x-auto px-3 [scrollbar-width:none]">
        {NAV_ITEMS.map(({ to, short, icon: Icon, end }) => (
          <li key={to} className="shrink-0">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  isActive ? 'bg-midnight text-white' : 'text-ink-soft hover:bg-sand'
                }`
              }
            >
              <Icon size={14} aria-hidden />
              {short}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
