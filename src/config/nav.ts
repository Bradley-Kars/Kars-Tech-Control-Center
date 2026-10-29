import * as React from 'react';
import {
  Layout,
  Ticket,
  Settings,
  Monitor,
  Terminal,
  ShieldCheck,
  Bell,
  MessageCircle,
} from 'lucide-react';

export interface NavItem {
  id: string;
  /** Human-readable label (Inter for UI text). */
  label: string;
  /** Exact route path (or prefix for dynamic routes). */
  href: string;
  /** Lucide icon component. */
  icon: React.ElementType;
  description?: string;
  /** Whether this item is rendered in the sidebar. */
  sidebar?: boolean;
}

/**
 * Single source of truth for navigation labels, icons, and routes.
 * Sidebar, top bar title, breadcrumb, and command palette all read from here.
 */
export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: Layout, description: 'Fleet-wide status', sidebar: false },
  { id: 'ticketing', label: 'Ticketing', href: '/ticketing', icon: Ticket, description: 'Tickets & invoices', sidebar: true },
  { id: 'meshcentral', label: 'MeshCentral', href: '/meshcentral', icon: Monitor, description: 'Fleet devices & agents', sidebar: false },
  { id: 'fleet-command', label: 'Fleet Command', href: '/fleet-command', icon: Terminal, description: 'Batch commands across devices', sidebar: false },
  { id: 'compliance', label: 'Patch Compliance', href: '/compliance', icon: ShieldCheck, description: 'Update status & remote updates', sidebar: false },
  { id: 'alerts', label: 'Alerts', href: '/alerts', icon: Bell, description: 'Active & acknowledged alerts', sidebar: false },
  { id: 'chat', label: 'Hermes Chat', href: '/chat', icon: MessageCircle, description: 'AI assistant for fleet ops', sidebar: false },
  { id: 'settings', label: 'Settings', href: '/settings', icon: Settings, description: 'App settings', sidebar: true },
];

/** Items rendered in the sidebar — the only two linkable destinations in this phase. */
export const SIDEBAR_ITEMS: ReadonlyArray<NavItem> = NAV_ITEMS.filter((item) => item.sidebar);

/** Dynamic device labels (JetBrains Mono for hostnames/IDs). */
export const DEVICE_LABELS: Readonly<Record<string, string>> = {
  local: 'This Machine',
  unraid: 'Unraid Server',
  phone: 'Galaxy S24 Ultra',
  ally: 'ROG Ally',
  laptop: 'Senpai Laptop',
};

/** Dynamic service labels. */
export const SERVICE_LABELS: Readonly<Record<string, string>> = {
  docker: 'Docker',
  storage: 'Storage',
  system: 'System',
  network: 'Network',
  lidarr: 'Lidarr',
  homeassistant: 'Home Assistant',
  nextcloud: 'Nextcloud',
  adguard: 'AdGuard',
  myspeed: 'MySpeed',
};

/**
 * Resolve the page title for any route, falling back to the configured label.
 * Dynamic device/service segments resolve to their friendly labels.
 */
export function routeTitle(pathname: string): string {
  if (pathname === '/' || pathname === '/dashboard') return 'Dashboard';
  if (pathname.startsWith('/device/')) {
    const device = pathname.split('/device/')[1];
    return DEVICE_LABELS[device] ?? 'Device';
  }
  if (pathname.startsWith('/service/')) {
    const service = pathname.split('/service/')[1];
    return SERVICE_LABELS[service] ?? 'Service';
  }
  const item = NAV_ITEMS.find((i) => pathname === i.href || pathname.startsWith(i.href + '/'));
  return item ? item.label : 'KTS Master Control';
}

/** Breadcrumbs for the current route (single item, derived from nav config). */
export function breadcrumbLabel(pathname: string): string {
  return routeTitle(pathname);
}
