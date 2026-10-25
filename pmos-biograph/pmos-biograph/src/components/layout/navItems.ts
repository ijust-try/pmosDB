import { BookOpen, Database, LayoutGrid, Library, Network, Pill, Waypoints, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/explore', label: 'Explore Entities', icon: Library },
  { to: '/graph', label: 'BioGraph', icon: Network },
  { to: '/pathways', label: 'Pathways', icon: Waypoints },
  { to: '/therapeutics', label: 'Therapeutics', icon: Pill },
  { to: '/evidence', label: 'Research & Evidence', icon: BookOpen },
  { to: '/sources', label: 'Data Sources', icon: Database },
];
