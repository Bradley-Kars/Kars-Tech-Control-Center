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
  Package,
  HardDrive,
  Wifi,
  Music,
  Home,
  Cloud,
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
  { id: 'chat', label: 'Hermes Chat', href: '/chat', icon: MessageCircle, description: 'AI assistant for fleet ops', sidebar: true },
  { id: 'settings', label: 'Settings', href: '/settings', icon: Settings, description: 'App settings', sidebar: true },
];

/** Items rendered in the sidebar. */
export const SIDEBAR_ITEMS: ReadonlyArray<NavItem> = NAV_ITEMS.filter((item) => item.sidebar);

export interface NavGroup {
  id: string;
  label: string;
  pages: ReadonlyArray<NavItem>;
}

/**
 * Sidebar navigation groups, in display order. Groups are collapsible sections;
 * every page below is a linkable destination. This is the single source of
 * truth for the sidebar layout — labels, icons and routes are shared with
 * NAV_ITEMS above (routeTitle/breadcrumb still resolve from NAV_ITEMS).
 */
export const SIDEBAR_GROUPS: ReadonlyArray<NavGroup> = [
  {
    id: 'services',
    label: 'Services',
    pages: [
      { id: 'docker', label: 'Docker', href: '/service/docker', icon: Package, description: 'Container management', sidebar: true },
      { id: 'storage', label: 'Storage', href: '/service/storage', icon: HardDrive, description: 'Array, disks & shares', sidebar: true },
      { id: 'system', label: 'System', href: '/service/system', icon: Settings, description: 'CPU, memory & processes', sidebar: true },
      { id: 'network', label: 'Network', href: '/service/network', icon: Wifi, description: 'Interfaces & Tailscale', sidebar: true },
    ],
  },
  {
    id: 'arr',
    label: 'Arr',
    pages: [{ id: 'arr', label: 'Arr', href: '/service/arr', icon: Music, description: 'Lidarr, Sonarr & Radarr', sidebar: true }],
  },
  {
    id: 'more-services',
    label: 'More Services',
    pages: [
      { id: 'homeassistant', label: 'Home Assistant', href: '/service/homeassistant', icon: Home, description: 'Home automation', sidebar: true },
      { id: 'nextcloud', label: 'Nextcloud', href: '/service/nextcloud', icon: Cloud, description: 'File sync & share', sidebar: true },
      { id: 'adguard', label: 'AdGuard', href: '/service/adguard', icon: ShieldCheck, description: 'DNS filtering', sidebar: true },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    pages: [{ id: 'ticketing', label: 'Ticketing', href: '/ticketing', icon: Ticket, description: 'Tickets & invoices', sidebar: true }],
  },
  {
    id: 'hermes',
    label: 'Hermes',
    pages: [{ id: 'chat', label: 'Hermes', href: '/chat', icon: Terminal, description: 'Terminal page (SSH via the bridge)', sidebar: true }],
  },
  {
    id: 'settings',
    label: 'Settings',
    pages: [{ id: 'settings', label: 'Settings', href: '/settings', icon: Settings, description: 'App settings', sidebar: true }],
  },
];

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
  arr: 'Arr',
  homeassistant: 'Home Assistant',
  nextcloud: 'Nextcloud',
  adguard: 'AdGuard',
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
