import * as React from 'react';
import {
  Layout,
  Ticket,
  ShieldCheck,
  Terminal,
  Home,
  Smartphone,
  Gamepad,
  HardDrive,
  Monitor,
  Settings,
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
  /** Human-readable description (used as subtitle/tooltip). */
  description?: string;
  /** Whether this item is rendered in the sidebar. */
  sidebar?: boolean;
}

/**
 * Single source of truth for navigation labels, icons, and routes.
 * Sidebar, top bar title, breadcrumb, and command palette all read from here.
 */
export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: Layout, description: 'Fleet-wide status', sidebar: true },
  { id: 'ticketing', label: 'Ticketing', href: '/ticketing', icon: Ticket, description: 'Tickets & invoices', sidebar: true },
  { id: 'meshcentral', label: 'MeshCentral', href: '/meshcentral', icon: ShieldCheck, description: 'MeshCentral fleet management', sidebar: false },
  { id: 'fleet-command', label: 'Fleet Command', href: '/fleet-command', icon: Terminal, description: 'Batch commands across devices', sidebar: false },
  { id: 'compliance', label: 'Patch Compliance', href: '/compliance', icon: ShieldCheck, description: 'Update status & remote updates', sidebar: false },
  { id: 'alerts', label: 'Alerts', href: '/alerts', icon: Bell, description: 'Active & acknowledged alerts', sidebar: false },
  { id: 'chat', label: 'Hermes Chat', href: '/chat', icon: MessageCircle, description: 'AI assistant for fleet ops', sidebar: true },
  { id: 'settings', label: 'Settings', href: '/settings', icon: Settings, description: 'App settings', sidebar: true },
];

/** Items rendered in the sidebar. */
export const SIDEBAR_ITEMS: ReadonlyArray<NavItem> = NAV_ITEMS.filter((item) => item.sidebar);

/**
 * Device entries discovered from servers.json. These are added dynamically
 * when devices are configured via the Connection screen.
 */
export interface DeviceItem {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  description?: string;
  device_type: string;
  status: 'connected' | 'offline' | 'not_configured';
}

/**
 * Sidebar navigation groups, in display order. Groups are collapsible sections;
 * every page below is a linkable destination. This is the single source of
 * truth for the sidebar layout — labels, icons, and routes are shared with
 * NAV_ITEMS above (routeTitle/breadcrumb still resolve from NAV_ITEMS).
 */
export const SIDEBAR_GROUPS: ReadonlyArray<NavGroup> = [
  {
    id: 'fleet',
    label: 'Fleet',
    pages: [
      { id: 'dashboard', label: 'Overview', href: '/dashboard', icon: Layout, description: 'Fleet-wide status', sidebar: true },
      { id: 'alerts', label: 'Alerts', href: '/alerts', icon: Bell, description: 'Active & acknowledged alerts', sidebar: true },
      { id: 'fleet-command', label: 'Fleet Command', href: '/fleet-command', icon: Terminal, description: 'Batch commands across devices', sidebar: true },
      { id: 'compliance', label: 'Patch Compliance', href: '/compliance', icon: ShieldCheck, description: 'Update status & remote updates', sidebar: false },
    ],
  },
  {
    id: 'devices',
    label: 'Devices',
    pages: [
      { id: 'device-local', label: 'This Machine', href: '/device/local', icon: Home, description: 'Local Omarchy host', sidebar: true },
      { id: 'device-unraid', label: 'Unraid Server', href: '/device/unraid', icon: HardDrive, description: 'Unraid server', sidebar: true },
      { id: 'device-phone', label: 'Galaxy S24 Ultra', href: '/device/phone', icon: Smartphone, description: 'Galaxy S24 Ultra', sidebar: true },
        { id: 'device-ally', label: 'ROG Ally', href: '/device/ally', icon: Gamepad, description: 'ROG Ally handheld', sidebar: true },
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
    pages: [{ id: 'chat', label: 'Hermes Chat', href: '/chat', icon: Terminal, description: 'Hermes terminal page', sidebar: true }],
  },
  {
    id: 'settings',
    label: 'Settings',
    pages: [{ id: 'settings', label: 'Settings', href: '/settings', icon: Settings, description: 'App settings', sidebar: true }],
  },
];

/**
 * Dynamic device labels. These are populated dynamically from the servers
 * fetched from the backend at runtime.
 */
export const DYNAMIC_DEVICE_LABELS: Readonly<Record<string, string>> = {};

/**
 * Dynamic service labels.
 */
export const DYNAMIC_SERVICE_LABELS: Readonly<Record<string, string>> = {};

/**
 * Resolve the page title for any route, falling back to configured labels.
 * Dynamic device/service routes resolve to their friendly labels.
 */
export function routeTitle(pathname: string): string {
  if (pathname === '/' || pathname === '/dashboard') return 'Dashboard';

  // Check dynamic device routes first
  if (pathname.startsWith('/device/')) {
    const deviceId = pathname.split('/device/')[1];
    const device = DYNAMIC_DEVICE_LABELS[deviceId];
    if (device) return device;
    // Fall back to checking servers from the backend
    return 'Device';
  }
  if (pathname.startsWith('/service/')) {
    const service = pathname.split('/service/')[1];
    return DYNAMIC_SERVICE_LABELS[service] ?? 'Service';
  }
  const item = NAV_ITEMS.find((i) => pathname === i.href || pathname.startsWith(i.href + '/'));
  return item ? item.label : 'KTS Master Control';
}

/** Breadcrumbs for the current route (single item, derived from nav config). */
export function breadcrumbLabel(pathname: string): string {
  return routeTitle(pathname);
}

/**
 * Build the full sidebar navigation including dynamic devices.
 * This is called by the Sidebar component to get the full list of groups
 * including dynamically discovered devices from the backend.
 */
export function getSidebarGroups(
  devices: Array<{ id: string; name: string; device_type: string; hostname: string }> = [],
): ReadonlyArray<NavGroup> {
  // Build device items from the backend server list
  const deviceItems: ReadonlyArray<NavItem> = devices.map((device) => {
    const iconMap: Record<string, React.ElementType> = {
      unraid: HardDrive,
      phone: Smartphone,
      steamdeck: Gamepad,
      laptop: Home,
      generic: Monitor,
    };
    const Icon = iconMap[device.device_type] || Monitor;
    return {
      id: `device-${device.id}`,
      label: device.name,
      href: `/device/${device.id}`,
      icon: Icon,
      description: `${device.device_type} • ${device.hostname}`,
      sidebar: true,
      device_type: device.device_type,
      status: 'connected',
    };
  });

  return [
    {
      id: 'fleet',
      label: 'Fleet',
      pages: SIDEBAR_GROUPS.find((g) => g.id === 'fleet')?.pages || [],
    },
    {
      id: 'devices',
      label: 'Devices',
      pages: [
        { id: 'device-local', label: 'This Machine', href: '/device/local', icon: Home, description: 'Local Omarchy host', sidebar: true },
        { id: 'device-unraid', label: 'Unraid Server', href: '/device/unraid', icon: HardDrive, description: 'Unraid server', sidebar: true },
        { id: 'device-phone', label: 'Galaxy S24 Ultra', href: '/device/phone', icon: Smartphone, description: 'Galaxy S24 Ultra', sidebar: true },
        { id: 'device-ally', label: 'ROG Ally', href: '/device/ally', icon: Gamepad, description: 'ROG Ally handheld', sidebar: true },
        ...deviceItems,
      ],
    },
    {
      id: 'business',
      label: 'Business',
      pages: SIDEBAR_GROUPS.find((g) => g.id === 'business')?.pages || [],
    },
    {
      id: 'hermes',
      label: 'Hermes',
      pages: SIDEBAR_GROUPS.find((g) => g.id === 'hermes')?.pages || [],
    },
    {
      id: 'settings',
      label: 'Settings',
      pages: SIDEBAR_GROUPS.find((g) => g.id === 'settings')?.pages || [],
    },
  ];
}

export interface NavGroup {
  id: string;
  label: string;
  pages: ReadonlyArray<NavItem>;
}