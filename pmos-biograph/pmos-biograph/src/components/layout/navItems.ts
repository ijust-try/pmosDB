import { BookOpen, Database, Info, LayoutGrid, Library, Network, Pill, Waypoints, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  /** Shorter label for the phone navigation strip. */
  short: string;
  icon: LucideIcon;
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', short: 'Home', icon: LayoutGrid, end: true },
  { to: '/explore', label: 'Explore Entities', short: 'Explore', icon: Library },
  { to: '/graph', label: 'BioGraph', short: 'BioGraph', icon: Network },
  { to: '/pathways', label: 'Pathways', short: 'Pathways', icon: Waypoints },
  { to: '/therapeutics', label: 'Therapeutics', short: 'Therapeutics', icon: Pill },
  { to: '/evidence', label: 'Research & Evidence', short: 'Evidence', icon: BookOpen },
  { to: '/sources', label: 'Data Sources', short: 'Sources', icon: Database },
  { to: '/about', label: 'About', short: 'About', icon: Info },
];
