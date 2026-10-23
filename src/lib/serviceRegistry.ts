import type { ServiceKeys } from './types';

/**
 * Single source of truth for the app's navigation + per-page metadata.
 *
 * Before this existed the page list was duplicated in three places that
 * disagreed: App.tsx's `Page` union listed 12 pages, Sidebar.tsx declared its
 * own copy of the union, and only 7 of them ever appeared in NAV_ITEMS — so the
 * five service pages (nextcloud, lidarr, homeassistant, myspeed, adguard) were
 * reachable *only* by clicking a dashboard card. Both unions are now derived
 * from the table below.
 *
 * This module is deliberately data-only (no component imports) so pages can
 * import from it without creating a cycle; App.tsx owns id -> component
 * mapping.
 */

export type PageId =
  | 'dashboard'
  | 'phone'
  | 'steamdeck'
  | 'docker'
  | 'storage'
  | 'system'
  | 'network'
  | 'nextcloud'
  | 'lidarr'
  | 'homeassistant'
  | 'myspeed'
  | 'adguard'
  | 'meshcentral';

/** Which device a page needs to talk to. Drives server resolution in App.tsx. */
export type DeviceRole = 'none' | 'unraid' | 'phone' | 'handheld';

export type NavGroup = 'fleet' | 'server' | 'services' | 'management';

export interface PageDef {
  id: PageId;
  label: string;
  icon: string;
  group: NavGroup;
  /**
   * Device whose credentials this page requires.
   *  - 'none'    : local to the machine running the app
   *  - 'unraid'  : the home server
   *  - 'phone'   : the Galaxy S24
   *  - 'handheld': the ROG Ally
   */
  deviceRole: DeviceRole;
  /** service_keys entries that must be present for the page to be useful. */
  requiredKeys?: (keyof ServiceKeys)[];
  /** Background refresh cadence in ms. 0 = no polling. */
  pollMs?: number;
  /**
   * Whether the page appears in the sidebar.
   *
   * The five service pages are intentionally `nav: false` — the dashboard acts
   * as the hub and links into them. This is a deliberate, test-covered design
   * choice (see Sidebar.test.tsx "does not render service pages in nav"), so it
   * is expressed here rather than by silently omitting them from the table.
   */
  nav: boolean;
  description: string;
}

export const PAGES: PageDef[] = [
  {
    id: 'dashboard',
    nav: true,
    label: 'Dashboard',
    icon: '◈',
    group: 'fleet',
    deviceRole: 'none',
    pollMs: 5000,
    description: 'Fleet-wide status across every configured device',
  },
  {
    id: 'phone',
    nav: true,
    label: 'Phone',
    icon: '📱',
    group: 'fleet',
    deviceRole: 'phone',
    requiredKeys: ['phone_adb_serial'],
    pollMs: 5000,
    description: 'Galaxy S24 Ultra: battery, thermal, apps, SMS, KDE Connect',
  },
  {
    id: 'steamdeck',
    nav: true,
    label: 'ROG Ally',
    icon: '🎮',
    group: 'fleet',
    deviceRole: 'handheld',
    pollMs: 5000,
    description: 'ROG Ally handheld: SoC, GPU, battery, deskflow, provisioning',
  },
  {
    id: 'docker',
    nav: true,
    label: 'Docker',
    icon: '⬡',
    group: 'server',
    deviceRole: 'unraid',
    pollMs: 5000,
    description: 'Unraid containers: state, start/stop/restart, logs',
  },
  {
    id: 'storage',
    nav: true,
    label: 'Storage',
    icon: '▤',
    group: 'server',
    deviceRole: 'unraid',
    pollMs: 10000,
    description: 'Array state, disks, SMART, shares',
  },
  {
    id: 'system',
    nav: true,
    label: 'System',
    icon: '⚙',
    group: 'server',
    deviceRole: 'unraid',
    pollMs: 5000,
    description: 'CPU, memory, load, processes, syslog, plugins, user scripts',
  },
  {
    id: 'network',
    nav: true,
    label: 'Network',
    icon: '◎',
    group: 'server',
    deviceRole: 'unraid',
    pollMs: 15000,
    description: 'Interfaces, Tailscale peers, connectivity',
  },
  {
    id: 'nextcloud',
    nav: false,
    label: 'Nextcloud',
    icon: '☁',
    group: 'services',
    deviceRole: 'unraid',
    requiredKeys: ['nextcloud_user', 'nextcloud_pass'],
    pollMs: 30000,
    description: 'Nextcloud: status, storage quota, users, activity',
  },
  {
    id: 'lidarr',
    nav: false,
    label: 'Lidarr',
    icon: '♪',
    group: 'services',
    deviceRole: 'unraid',
    requiredKeys: ['lidarr_api_key'],
    pollMs: 30000,
    description: 'Lidarr: health, artists, albums, wanted, queue, diskspace',
  },
  {
    id: 'homeassistant',
    nav: false,
    label: 'Home Assistant',
    icon: '⌂',
    group: 'services',
    deviceRole: 'unraid',
    requiredKeys: ['homeassistant_token'],
    pollMs: 10000,
    description: 'Home Assistant: states, areas, devices, entity control',
  },
  {
    id: 'myspeed',
    nav: false,
    label: 'MySpeed',
    icon: '↯',
    group: 'services',
    deviceRole: 'unraid',
    requiredKeys: ['myspeed_db_path'],
    pollMs: 60000,
    description: 'MySpeed: speedtest history, summary, per-server results',
  },
  {
    id: 'adguard',
    nav: false,
    label: 'AdGuard',
    icon: '⛨',
    group: 'services',
    deviceRole: 'unraid',
    requiredKeys: ['adguard_user', 'adguard_pass'],
    pollMs: 5000,
    description: 'AdGuard Home: protection, stats, query log, clients, filters',
  },
  {
    id: 'meshcentral',
    nav: true,
    label: 'MeshCentral',
    icon: '🌐',
    group: 'management',
    deviceRole: 'none',
    pollMs: 15000,
    description: 'MeshCentral fleet management: terminal, files, batch commands, enrollment',
  },
];

export const PAGE_IDS: PageId[] = PAGES.map((p) => p.id);

export const NAV_PAGES: PageDef[] = PAGES.filter((p) => p.nav);

export const GROUPS: { id: NavGroup; label: string }[] = [
  { id: 'fleet', label: 'Fleet' },
  { id: 'server', label: 'Server' },
  { id: 'services', label: 'Services' },
  { id: 'management', label: 'Management' },
];

/** In-nav pages for a group, in declaration order. */
export function pagesInGroup(group: NavGroup): PageDef[] {
  return NAV_PAGES.filter((p) => p.group === group);
}

const BY_ID = new Map(PAGES.map((p) => [p.id, p]));

export function pageDef(id: PageId): PageDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown page: ${id}`);
  return def;
}

export function isPageId(value: string): value is PageId {
  return BY_ID.has(value as PageId);
}

/**
 * Device roles a `device_type` string from servers.json satisfies.
 * Kept permissive on the linux/handheld side because Unraid and Bazzite
 * handhelds both report plain "linux".
 */
export function matchesRole(deviceType: string, role: DeviceRole): boolean {
  if (role === 'none') return true;
  const dt = deviceType.toLowerCase();
  switch (role) {
    case 'unraid':
      return dt === 'unraid';
    case 'phone':
      return dt === 'phone' || dt === 'android';
    case 'handheld':
      return dt === 'steamdeck' || dt === 'handheld' || dt === 'bazzite';
    default:
      return false;
  }
}

/** True when the page's required service keys are all present. */
export function hasRequiredKeys(
  def: PageDef,
  serviceKeys: ServiceKeys | undefined,
): boolean {
  if (!def.requiredKeys || def.requiredKeys.length === 0) return true;
  if (!serviceKeys) return false;
  return def.requiredKeys.every((k) => {
    const v = serviceKeys[k];
    return typeof v === 'string' && v.length > 0;
  });
}
