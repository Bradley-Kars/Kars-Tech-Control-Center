import type { Page } from '@playwright/test';

/**
 * Shared stub data for the /api/fleet fetch endpoints.
 * Kept in the Node process so it can be served both by page.route() (below)
 * and injected into the page via addInitScript for the legacy Tauri-invoke shims.
 */
const mockData: Record<string, unknown> = {
  get_servers: [
    { id: 'test-server-1', name: 'Test Server', hostname: '<device>.<tailnet>.ts.net', username: 'root', auth: { password: 'test' }, api_key: 'test-key', device_type: 'unraid', service_keys: { nextcloud_user: '<user>', nextcloud_pass: 'pass', lidarr_api_key: 'key', homeassistant_token: 'token', adguard_user: '<user>', adguard_pass: 'pass', adguard_url: 'https://adguard.<tailnet>.ts.net:8443' } },
    { id: 'test-phone-1', name: 'Galaxy S24', hostname: '<device>-ultra.<tailnet>.ts.net', username: 'root', auth: { password: 'test' }, device_type: 'phone', service_keys: { phone_adb_serial: '<device>-ultra.<tailnet>.ts.net:36887', kdeconnect_device_id: '7cc37f37453c42f2b5713a505ec547c1', phone_rustdesk_id: '1321035736' } },
    { id: 'test-steamdeck-1', name: 'ROG Ally', hostname: '<device>.<tailnet>.ts.net', username: '<device>_Ally', auth: { password: 'test-pass' }, device_type: 'steamdeck', service_keys: { steamdeck_rustdesk_id: '2306695', steamdeck_rustdesk_password: 'test-pass', steamdeck_kdeconnect_device_id: 'ally-device-id' } },
  ],
  get_system_stats: { hostname: 'home-server', kernel: '6.18.38-Unraid', os_release: '6.18.38-Unraid', arch: 'x86_64', uptime: '2024-01-15T10:30:00Z', cpu_usage: 28.9, cpu_cores: 6, cpu_threads: 12, cpu_brand: 'Intel Core i7-8700K', cpu_speed: 3.7, memory_total_mb: 16384, memory_used_mb: 12123, memory_free_mb: 4261, memory_usage_pct: 74.0, memory_total_bytes: 17179869184, memory_used_bytes: 12713275392, swap_total: 0, swap_used: 0, timezone: 'America/Chicago', temp_avg: 45.0, temp_hottest: 'coretemp', temp_hottest_value: 52.0, sensors: [], array_state: 'STARTED', system_manufacturer: 'OEM', system_model: 'Server' },
  get_docker_containers: [
    { id: 'abc123', name: 'nextcloud', image: 'linuxserver/nextcloud', state: 'running', status: 'Up 2 weeks', autoStart: true },
    { id: 'def456', name: 'lidarr', image: 'linuxserver/lidarr', state: 'running', status: 'Up 2 weeks', autoStart: true },
    { id: 'ghi789', name: 'homeassistant', image: 'home-assistant', state: 'running', status: 'Up 2 weeks', autoStart: true },
    { id: 'jkl012', name: 'adguard', image: 'adguard', state: 'running', status: 'Up 2 weeks', autoStart: true },
    { id: 'mno345', name: 'plex', image: 'plex', state: 'running', status: 'Up 2 weeks', autoStart: true },
    { id: 'pqr678', name: 'radarr', image: 'linuxserver/radarr', state: 'stopped', status: 'Exited', autoStart: true },
  ],
  get_gpu_info: { name: 'NVIDIA GeForce GTX 1080 Ti', temperature: '35', utilization: '12', memory_used: '1542', memory_total: '11264', power_usage: '67', power_cap: '280', driver_version: '560.35.03', cuda_version: '12.6' },
  get_disks: [
    { name: 'sda', device: '/dev/sda', type: 'SSD', size: 500107862016, vendor: 'Samsung', temperature: 32, smartStatus: 'PASSED', isSpinning: false },
    { name: 'sdb', device: '/dev/sdb', type: 'HDD', size: 8001563222016, vendor: 'WD', temperature: 35, smartStatus: 'PASSED', isSpinning: true },
  ],
  get_shares: [
    { name: 'appdata', comment: 'Appdata', allocator: 'mover', cache: 'Yes', size: 107374182400, free: 32212254720, used: 75161927680 },
    { name: 'media', comment: 'Media', allocator: 'mover', cache: 'No', size: 1099511627776, free: 549755813888, used: 549755813888 },
  ],
  get_adguard_status: { version: 'v0.107.79', protection_enabled: true, running: true, dns_addresses: ['192.168.1.100'], dns_port: 53, http_port: 8443 },
  get_adguard_stats: { dns_queries: { total: 3084491, blocked: 384155, replaced: 12000, safe_browsing: 500, parental: 200, avg_processing_time: 15.5 }, blocked: { domains: 125000, clients: 5 }, replaced: { domains: 1500, clients: 3 }, clients: { total: 5, active: 3 }, filters: { total: 27, enabled: 24 } },
  get_adguard_query_log: { activities: Array.from({ length: 50 }, (_, i) => ({ filterId: i % 5 === 0 ? 1777159247 : null, elapsedMs: '15.5', cached: false, client: `192.168.4.${100 + (i % 20)}`, client_info: { name: 'TestClient', whois: {}, disallowed_rule: '', disallowed: false }, client_proto: '', reason: i % 4 === 0 ? 'FilteredBlackList' : 'NotFilteredNotFound', rule: null, rules: [], status: 'NOERROR', time: new Date(Date.now() - i * 60000).toISOString(), upstream: 'quic://dns.quad9.net:853', answer: [{ type: 'A', value: '93.184.216.1', ttl: 3600 }], answer_dnssec: false, question: { type: 'A', name: `example${i}.com`, class: 'IN' } })), limit: 50, offset: 0, total: 3084491 },
  get_adguard_clients: { clients: [{ name: 'Ophelia', ids: ['192.168.4.127'], filtering_enabled: true, parental_enabled: false, safe_search_enabled: false, safe_browsing_enabled: false, use_global_settings: true }, { name: 'IoT', ids: ['192.168.4.69'], filtering_enabled: true, parental_enabled: false, safe_search_enabled: false, safe_browsing_enabled: false, use_global_settings: true }] },
  get_adguard_filters: [{ id: 1, enabled: true, name: 'AdGuard DNS filter', rules_count: 49360 }, { id: 2, enabled: true, name: 'AdGuard Base filter', rules_count: 157204 }],
  get_nextcloud_info: { installed: true, maintenance: false, version: '34.0.3.2', edition: 'Community' },
  get_nextcloud_status: { installed: true, maintenance: false, version: '34.0.3.2', edition: 'Community' },
  get_nextcloud_storage: { num_users: 3, num_files: 60509, num_storages: 4, num_storages_local: 1, num_storages_home: 3, num_storages_other: 0 },
  get_nextcloud_users: [{ id: '<user>', displayname: '<user>', enabled: true }, { id: 'admin', displayname: 'Admin', enabled: true }],
  get_nextcloud_activity: { activities: [{ app: 'files', subject: 'You created "test.txt"', timestamp: 1724000000, type: 'file', user: '<user>' }] },
  get_lidarr_status: { version: '3.1.0.4875', instanceName: 'Lidarr' },
  get_homeassistant_states: [{ entity_id: 'light.living_room', state: 'on', attributes: { friendly_name: 'Living Room Light' } }, { entity_id: 'switch.kitchen', state: 'off', attributes: { friendly_name: 'Kitchen Switch' } }],
  get_homeassistant_config: { components: [] },
  test_connection: { success: true, message: 'Connected', hostname: 'home-server', os: 'Unraid', services: { graphql: true, nextcloud: true, lidarr: true, homeassistant: true, adguard: true } },
  get_processes: 'root 1234 0.5 1.2 /usr/bin/foo',
  get_syslog: 'Aug 26 00:00:00 server kernel: test',
  get_plugins: ['plugin1', 'plugin2', 'plugin3'],
  get_network_interfaces: 'eth0 UP 192.168.1.100/24',
  get_tailscale_peers: '100.103.29.63 home-server',
  get_array_info: { state: 'STARTED', capacity: { disks: { free: 1000000000, used: 5000000000, total: 6000000000 } }, disks: [], caches: [] },
  get_user_scripts: 'backup.sh\ncleanup.sh',
  get_phone_device_info: { model: 'SM-S928U', android_version: '16', api_level: '36', serial: 'R5CT10XXXXX', manufacturer: 'Samsung', brand: 'Samsung', build_fingerprint: 'samsung/samsung' },
  get_phone_battery: { level: 85, status: '2', health: 'Good', temperature: 28.5, voltage: 4200, technology: 'Li-ion', charging: true, plugged: 'AC', current_ua: 1500000 },
  get_phone_storage: { total_gb: 256, used_gb: 128, free_gb: 128, usage_pct: 50 },
  get_phone_memory: { total_mb: 12288, available_mb: 6144, used_mb: 6144, usage_pct: 50 },
  get_kdeconnect_battery: { charge: 85, isCharging: true, hasBattery: true, iconName: 'battery-full-charged' },
  get_kdeconnect_connectivity: { cellular_network_strength: 3, cellular_network_type: '5G', icon_name: 'network-cellular-5g' },
  get_kdeconnect_list_devices: [
    { id: '7cc37f37453c42f2b5713a505ec547c1', name: 'Galaxy S24 Ultra', device_type: 'phone', is_paired: true, is_reachable: true, icon_name: 'phone' },
    { id: '_091dfaa5_10ae_4034_af89_a1e0a0b3dd05_', name: 'LGBTAlly', device_type: 'desktop', is_paired: true, is_reachable: false, icon_name: 'laptopdisconnected' },
  ],
};

/** Path -> mock data key. Returns {} / [] for unmapped paths so pages render empty instead of erroring. */
function mockFor(pathname: string): unknown {
  // getServers() unwraps the { servers, count } envelope; return it shaped that way.
  if (pathname === '/api/fleet/servers') {
    return { servers: mockData.get_servers, count: (mockData.get_servers as unknown[]).length };
  }
  const map: Record<string, string> = {
    '/api/fleet/system/stats': 'get_system_stats',
    '/api/fleet/local/stats': 'get_system_stats',
    '/api/fleet/unraid/get_gpu_info': 'get_gpu_info',
    '/api/fleet/unraid/get_smart_data': 'get_gpu_info',
    '/api/fleet/unraid/get_docker_containers': 'get_docker_containers',
    '/api/fleet/unraid/get_array_info': 'get_array_info',
    '/api/fleet/unraid/get_disks': 'get_disks',
    '/api/fleet/unraid/get_shares': 'get_shares',
    '/api/fleet/unraid/get_processes': 'get_processes',
    '/api/fleet/unraid/get_syslog': 'get_syslog',
    '/api/fleet/unraid/get_user_scripts': 'get_user_scripts',
    '/api/fleet/unraid/get_plugins': 'get_plugins',
    '/api/fleet/unraid/get_network_interfaces': 'get_network_interfaces',
    '/api/fleet/unraid/get_tailscale_peers': 'get_tailscale_peers',
    '/api/fleet/unraid/run_user_script': '',
    '/api/fleet/rest/health': {},
    '/api/fleet/rest/plex/identity': {},
    '/api/fleet/rest/plex/libraries': [],
    '/api/fleet/nextcloud/info': 'get_nextcloud_info',
    '/api/fleet/nextcloud/status': 'get_nextcloud_status',
    '/api/fleet/nextcloud/storage': 'get_nextcloud_storage',
    '/api/fleet/nextcloud/users': 'get_nextcloud_users',
    '/api/fleet/nextcloud/activity': 'get_nextcloud_activity',
    '/api/fleet/adguard/status': 'get_adguard_status',
    '/api/fleet/adguard/stats': 'get_adguard_stats',
    '/api/fleet/adguard/querylog': 'get_adguard_query_log',
    '/api/fleet/adguard/clients': 'get_adguard_clients',
    '/api/fleet/adguard/filters': 'get_adguard_filters',
    '/api/fleet/adguard/dhcp': {},
    '/api/fleet/homeassistant/get_homeassistant_states': 'get_homeassistant_states',
    '/api/fleet/homeassistant/get_homeassistant_config': 'get_homeassistant_config',
    '/api/fleet/homeassistant/get_homeassistant_areas': [],
    '/api/fleet/homeassistant/get_homeassistant_devices': [],
    '/api/fleet/homeassistant/get_homeassistant_entities': [],
    '/api/fleet/arr/status': 'get_lidarr_status',
    '/api/fleet/arr/health': [],
    '/api/fleet/arr/artists': [],
    '/api/fleet/arr/albums': [],
    '/api/fleet/arr/wanted': {},
    '/api/fleet/arr/queue': {},
    '/api/fleet/arr/diskspace': [],
    '/api/fleet/arr/calendar': [],
    '/api/fleet/arr/library_total': {},
    '/api/fleet/phone/device_info': 'get_phone_device_info',
    '/api/fleet/phone/battery': 'get_phone_battery',
    '/api/fleet/phone/storage': 'get_phone_storage',
    '/api/fleet/phone/memory': 'get_phone_memory',
    '/api/fleet/kdeconnect/battery': 'get_kdeconnect_battery',
    '/api/fleet/kdeconnect/connectivity': 'get_kdeconnect_connectivity',
    '/api/fleet/kdeconnect/list_devices': 'get_kdeconnect_list_devices',
    '/api/fleet/meshcentral/list_devices': [],
    '/api/fleet/meshcentral/get_device_status': {},
    '/api/fleet/meshcentral/get_terminal_url': '',
    '/api/fleet/meshcentral/get_file_manager_url': '',
    '/api/fleet/meshcentral/get_enrollment_info': {},
    '/api/fleet/meshcentral/get_fleet_stats': {},
    '/api/fleet/meshcentral/list_dir': [],
    '/api/fleet/meshcentral/get_processes': [],
    '/api/fleet/alerts/list': [],
    '/api/fleet/metrics/query': [],
    '/api/fleet/metrics/query_multi': [],
  };
  const key = map[pathname];
  if (key === undefined) return {};
  const value = mockData[key];
  return value === undefined ? {} : value;
}

export async function mockFleetBackend(page: Page) {
  await page.addInitScript((mock) => {
    // @ts-ignore
    window.__FLEET_MOCK__ = mock;
    // Mock invoke for any compatibility shims that still reference it
    // @ts-ignore
    window.__FLEET_INTERNALS__ = {
      invoke: async (cmd: string, args?: Record<string, unknown>) => (mock as Record<string, unknown>)[cmd] ?? null,
      transformCallback: (cb: any) => 0,
    };
    // @ts-ignore
    window.__FLEET__ = window.__FLEET__ || {};
    // @ts-ignore
    window.__FLEET__.core = {
      invoke: async (cmd: string, args?: Record<string, unknown>) => (mock as Record<string, unknown>)[cmd] ?? null,
    };
  }, mockData);

  // Serve the fetch-based /api/fleet API used by src/lib/fleet-api.ts.
  // `**` (not `*`): endpoints like /api/fleet/alerts/list have multiple path segments.
  await page.route('**/api/fleet/**', async (route) => {
    const url = route.request().url();
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return;
    }
    const body = mockFor(pathname);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  // One-time terminal ticket minted by POST /api/terminal/ticket (C3).
  await page.route('**/api/terminal/ticket', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ticket: 'stub-ticket', expires_in: 300 }) });
  });
}
