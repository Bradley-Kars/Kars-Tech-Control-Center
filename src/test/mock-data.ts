export const mockServerConfig = {
  id: 'test-server-1',
  name: 'Test Unraid Server',
  hostname: 'home-server.tailf6d3b4.ts.net',
  port: 22,
  username: 'root',
  auth: { type: 'password' as const, password: 'test-password' },
  device_type: 'unraid',
  api_key: 'test-api-key-123',
  service_keys: {
    nextcloud_user: 'slayerbrk',
    nextcloud_pass: 'test-nc-pass',
    lidarr_api_key: 'test-lidarr-key',
    homeassistant_token: 'test-ha-token',
    myspeed_db_path: '/mnt/user/appdata/myspeed/storage.db',
    myspeed_url: 'http://localhost:5216',
    adguard_user: 'slayerbrk',
    adguard_pass: 'test-adguard-pass',
    adguard_url: 'https://adguard.tailf6d3b4.ts.net:8443',
  },
};

export const mockSystemStats = {
  hostname: 'home-server',
  kernel: '6.18.38-Unraid',
  os_release: '6.18.38-Unraid',
  arch: 'x86_64',
  uptime: '2024-01-15T10:30:00.000000000-05:00',
  cpu_usage: 28.9,
  cpu_cores: 6,
  cpu_threads: 12,
  cpu_brand: 'Intel(R) Core(TM) i7-8700K CPU @ 3.70GHz',
  cpu_speed: 3.7,
  memory_total_mb: 16384,
  memory_used_mb: 12123,
  memory_free_mb: 4261,
  memory_usage_pct: 74.0,
  memory_total_bytes: 17179869184,
  memory_used_bytes: 12713275392,
  swap_total: 0,
  swap_used: 0,
  timezone: 'America/Chicago',
  temp_avg: 45.0,
  temp_hottest: 'coretemp',
  temp_hottest_value: 52.0,
  sensors: [],
  array_state: 'STARTED',
  system_manufacturer: 'To Be Filled By O.E.M.',
  system_model: 'To Be Filled By O.E.M.',
};

export const mockDockerContainers = [
  {
    id: 'abc123def456',
    name: 'nextcloud',
    image: 'linuxserver/nextcloud:latest',
    state: 'running',
    status: 'Up 2 weeks',
    autoStart: true,
  },
  {
    id: 'def789ghi012',
    name: 'lidarr',
    image: 'linuxserver/lidarr:latest',
    state: 'running',
    status: 'Up 2 weeks',
    autoStart: true,
  },
  {
    id: 'ghi345jkl678',
    name: 'homeassistant',
    image: 'ghcr.io/home-assistant/home-assistant:stable',
    state: 'running',
    status: 'Up 2 weeks',
    autoStart: true,
  },
  {
    id: 'jkl901mno234',
    name: 'myspeed',
    image: 'germanetto/myspeed:latest',
    state: 'running',
    status: 'Up 2 weeks',
    autoStart: true,
  },
  {
    id: 'mno567pqr890',
    name: 'adguard',
    image: 'adguard/adguardhome:latest',
    state: 'running',
    status: 'Up 2 weeks',
    autoStart: true,
  },
  {
    id: 'pqr123stu456',
    name: 'plex',
    image: 'plexinc/plexmediaserver:latest',
    state: 'running',
    status: 'Up 2 weeks',
    autoStart: true,
  },
  {
    id: 'stu789vwx012',
    name: 'radarr',
    image: 'linuxserver/radarr:latest',
    state: 'stopped',
    status: 'Exited (0) 3 days ago',
    autoStart: true,
  },
  {
    id: 'vwx345yza678',
    name: 'sonarr',
    image: 'linuxserver/sonarr:latest',
    state: 'running',
    status: 'Up 2 weeks',
    autoStart: true,
  },
];

export const mockGpuInfo = {
  name: 'NVIDIA GeForce GTX 1080 Ti',
  temperature: '35',
  utilization: '12',
  memory_used: '1542',
  memory_total: '11264',
  power_usage: '67',
  power_cap: '280',
  driver_version: '560.35.03',
  cuda_version: '12.6',
};

export const mockDisks = [
  { name: 'sda', device: '/dev/sda', type: 'SSD', size: 500107862016, vendor: 'Samsung', temperature: 32, smartStatus: 'PASSED', isSpinning: false },
  { name: 'sdb', device: '/dev/sdb', type: 'HDD', size: 8001563222016, vendor: 'Western Digital', temperature: 35, smartStatus: 'PASSED', isSpinning: true },
  { name: 'sdc', device: '/dev/sdc', type: 'HDD', size: 8001563222016, vendor: 'Seagate', temperature: 38, smartStatus: 'PASSED', isSpinning: true },
  { name: 'nvme0n1', device: '/dev/nvme0n1', type: 'NVMe', size: 1024209543168, vendor: 'Samsung', temperature: 28, smartStatus: 'PASSED', isSpinning: false },
];

export const mockShares = [
  { name: 'appdata', comment: 'Appdata', allocator: 'mover', cache: 'Yes', size: 107374182400, free: 32212254720, used: 75161927680 },
  { name: 'media', comment: 'Media', allocator: 'mover', cache: 'No', size: 1099511627776, free: 549755813888, used: 549755813888 },
  { name: 'domains', comment: 'VM Domains', allocator: 'mover', cache: 'Yes', size: 53687091200, free: 42949672960, used: 10737418240 },
  { name: 'isos', comment: 'ISOs', allocator: 'mover', cache: 'No', size: 107374182400, free: 85899345920, used: 21474836480 },
];

export const mockAdGuardStatus = {
  version: 'v0.107.79',
  language: 'en',
  dns_addresses: ['192.168.1.100', '100.103.29.63'],
  dns_port: 53,
  http_port: 8443,
  protection_disabled_duration: 0,
  start_time: 1724000000,
  protection_enabled: true,
  dhcp_available: false,
  running: true,
  config_hash: 'abc123',
};

export const mockAdGuardStats = {
  dns_queries: {
    total: 3084491,
    blocked: 384155,
    replaced: 12000,
    safe_browsing: 500,
    parental: 200,
    avg_processing_time: 15.5,
  },
  blocked: { domains: 125000, clients: 5 },
  replaced: { domains: 1500, clients: 3 },
  clients: { total: 5, active: 3 },
  filters: { total: 27, enabled: 24 },
};

export const mockAdGuardQueryLog = {
  data: Array.from({ length: 50 }, (_, i) => ({
    filterId: i % 5 === 0 ? 1777159247 : null,
    elapsedMs: `${(Math.random() * 100).toFixed(4)}`,
    cached: i % 10 === 0,
    client: `192.168.4.${100 + (i % 20)}`,
    client_info: { name: i % 3 === 0 ? 'Ophelia' : '', whois: {}, disallowed_rule: '', disallowed: false },
    client_proto: '',
    reason: i % 4 === 0 ? 'FilteredBlackList' : i % 3 === 0 ? 'FilteredNotFound' : 'NotFilteredNotFound',
    rule: i % 4 === 0 ? '||example.com^' : null,
    rules: i % 4 === 0 ? [{ filter_list_id: 1777159247, text: '||example.com^' }] : [],
    status: 'NOERROR',
    time: new Date(Date.now() - i * 60000).toISOString(),
    upstream: i % 2 === 0 ? 'quic://dns.quad9.net:853' : 'https://dns.google/dns-query',
    answer: [{ type: 'A', value: `93.184.216.${i % 255}`, ttl: 3600 }],
    answer_dnssec: false,
    question: { type: 'A', name: `example${i}.com`, class: 'IN' },
  })),
  limit: 50,
  offset: 0,
  total: 3084491,
};

export const mockAdGuardClients = {
  clients: [
    { name: 'Ophelia', ids: ['192.168.4.127'], filtering_enabled: true, parental_enabled: false, safe_search: { enabled: false }, safebrowsing_enabled: false, use_global_settings: true, tags: [] },
    { name: 'IoT', ids: ['192.168.4.69'], filtering_enabled: true, parental_enabled: false, safe_search: { enabled: false }, safebrowsing_enabled: false, use_global_settings: true, tags: [] },
    { name: 'Desktop', ids: ['192.168.4.50'], filtering_enabled: true, parental_enabled: false, safe_search: { enabled: false }, safebrowsing_enabled: false, use_global_settings: true, tags: [] },
    { name: 'Laptop', ids: ['192.168.4.51'], filtering_enabled: true, parental_enabled: false, safe_search: { enabled: false }, safebrowsing_enabled: false, use_global_settings: true, tags: [] },
    { name: 'Phone', ids: ['192.168.4.52'], filtering_enabled: true, parental_enabled: false, safe_search: { enabled: false }, safebrowsing_enabled: false, use_global_settings: true, tags: [] },
  ],
};

export const mockAdGuardFilters = [
  { id: 1777159247, enabled: true, name: 'AdGuard DNS filter', rules_count: 49360, last_updated: '2024-08-25T00:00:00Z' },
  { id: 1777159248, enabled: true, name: 'AdGuard Base filter', rules_count: 157204, last_updated: '2024-08-25T00:00:00Z' },
  { id: 1777159249, enabled: true, name: 'AdGuard Annoyances filter', rules_count: 48712, last_updated: '2024-08-25T00:00:00Z' },
  { id: 1777159250, enabled: true, name: 'AdGuard Mobile filter', rules_count: 4531, last_updated: '2024-08-25T00:00:00Z' },
];

export const mockNextcloudInfo = {
  installed: true,
  maintenance: false,
  needsDbUpgrade: false,
  version: '34.0.3.2',
  versionstring: '34.0.3',
  edition: 'Community',
  productname: 'Nextcloud',
  extendedSupport: false,
};

export const mockNextcloudStorage = {
  num_users: 3,
  num_files: 60509,
  num_storages: 4,
  num_storages_local: 1,
  num_storages_home: 3,
  num_storages_other: 0,
};

export const mockNextcloudUsers = [
  { id: 'slayerbrk', display_name: 'slayerbrk', enabled: true, email: 'test@example.com', last_login: 1724000000, groups: ['admin'], backend: 'MySQL' },
  { id: 'admin', display_name: 'Admin', enabled: true, email: 'admin@example.com', last_login: 1724000000, groups: ['admin'], backend: 'MySQL' },
  { id: 'guest', display_name: 'Guest', enabled: true, email: null, last_login: 1724000000, groups: ['guest'], backend: 'MySQL' },
];

export const mockNextcloudActivity = {
  activities: [
    { app: 'files', subject: 'You created "test.txt"', timestamp: 1724000000, type: 'file', user: 'slayerbrk' },
    { app: 'files', subject: 'You uploaded "photo.jpg"', timestamp: 1724000001, type: 'file', user: 'slayerbrk' },
    { app: 'files', subject: 'You deleted "old.txt"', timestamp: 1724000002, type: 'file', user: 'slayerbrk' },
  ],
};

export const mockLidarrStatus = {
  version: '3.1.0.4875',
  buildTime: '2024-08-01T00:00:00Z',
  isDebug: false,
  isProduction: true,
  isAdmin: true,
  startupPath: '/opt/Lidarr',
  appData: '/config',
  osName: 'linux',
  osVersion: '6.18.38-Unraid',
  isLinux: true,
  isOsx: false,
  isWindows: false,
  branch: 'develop',
  authentication: 'forms',
  urlBase: '',
  instanceName: 'Lidarr',
};

export const mockLidarrArtists = [
  { id: 1, foreignArtistId: '83d91898-7763-47f7-af02-ce65d12154c4', artistName: 'Pink Floyd', monitored: true, metadataProfileId: 1, qualityProfileId: 1, rootFolderPath: '/mnt/user/media/music', tags: [] },
  { id: 2, foreignArtistId: '363d0f1c-c0e0-4a1f-b634-f7c68d23f2b2', artistName: 'Led Zeppelin', monitored: true, metadataProfileId: 1, qualityProfileId: 1, rootFolderPath: '/mnt/user/media/music', tags: [] },
  { id: 3, foreignArtistId: 'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d', artistName: 'The Beatles', monitored: true, metadataProfileId: 1, qualityProfileId: 1, rootFolderPath: '/mnt/user/media/music', tags: [] },
];

export const mockLidarrHealth = [];

export const mockLidarrAlbums = [
  { id: 1, foreignAlbumId: 'album-1', artistId: 1, title: 'The Dark Side of the Moon', albumType: 'album', status: 'released', monitored: true, releaseDate: '1973-03-01', genres: ['rock', 'progressive rock'], statistics: { trackCount: 10, trackFileCount: 10, sizeOnDisk: 536870912, percentOfTracks: 100 } },
  { id: 2, foreignAlbumId: 'album-2', artistId: 2, title: 'Led Zeppelin IV', albumType: 'album', status: 'released', monitored: true, releaseDate: '1971-11-08', genres: ['rock', 'hard rock'], statistics: { trackCount: 8, trackFileCount: 8, sizeOnDisk: 429496729, percentOfTracks: 100 } },
  { id: 3, foreignAlbumId: 'album-3', artistId: 3, title: 'Abbey Road', albumType: 'album', status: 'released', monitored: true, releaseDate: '1969-09-26', genres: ['rock', 'pop'], statistics: { trackCount: 17, trackFileCount: 17, sizeOnDisk: 644245094, percentOfTracks: 100 } },
  { id: 4, foreignAlbumId: 'album-4', artistId: 1, title: 'Wish You Were Here', albumType: 'album', status: 'released', monitored: true, releaseDate: '1975-09-12', genres: ['rock'], statistics: { trackCount: 5, trackFileCount: 5, sizeOnDisk: 375809638, percentOfTracks: 100 } },
];

export const mockLidarrWanted = {
  page: 1,
  pageSize: 20,
  sortKey: 'releaseDate',
  sortDirection: 'descending',
  totalRecords: 2,
  records: [
    { id: 1, artistId: 1, title: 'New Album 2026', monitored: true, releaseDate: '2026-09-01', artist: { artistName: 'Pink Floyd' } },
    { id: 2, artistId: 2, title: 'Remastered Classics', monitored: true, releaseDate: '2026-08-15', artist: { artistName: 'Led Zeppelin' } },
  ],
};

export const mockLidarrQueue = {
  page: 1,
  pageSize: 20,
  sortKey: 'timeleft',
  sortDirection: 'ascending',
  totalRecords: 1,
  records: [
    { id: 1, title: 'Pending Album', status: 'downloading', trackedDownloadStatus: 'ok', trackedDownloadState: 'downloading', size: 536870912, sizeleft: 214748364, timeleft: '00:15:30', estimatedCompletionTime: '2026-08-26T12:00:00Z', downloadId: 'dl-1', downloadClient: 'qBittorrent', indexer: 'RED', protocol: 'torrent' },
  ],
};

export const mockLidarrDiskspace = [
  { path: '/mnt/user/media/music', freeSpace: 549755813888, totalSpace: 1099511627776 },
];

export const mockHomeAssistantConfig = {
  components: ['hue', 'zwave', 'mqtt', 'automation', 'script', 'scene', 'notify', 'recorder', 'history', 'logbook'],
  config_dir: '/config',
  elevation: 300,
  latitude: 41.8781,
  location_name: 'Home',
  longitude: -87.6298,
  time_zone: 'America/Chicago',
  unit_system: { length: 'mi', mass: 'lb', temperature: '°F', volume: 'gal' },
  version: '2024.8.3',
};

export const mockHomeAssistantAreas = [
  { area_id: 'living_room', name: 'Living Room', icon: 'sofa', floor_id: 'ground_floor' },
  { area_id: 'kitchen', name: 'Kitchen', icon: 'countertop', floor_id: 'ground_floor' },
  { area_id: 'bedroom', name: 'Bedroom', icon: 'bed', floor_id: 'first_floor' },
];

export const mockHomeAssistantDevices = [
  { id: 'device-1', name: 'Philips Hue Bridge', name_by_user: 'Hue Bridge', model: 'Bridge V2', manufacturer: 'Signify', sw_version: '1.50.2', area_id: 'living_room', labels: [], identifiers: [['hue', 'bridge-1']], connections: [] },
  { id: 'device-2', name: 'Kitchen Switch', name_by_user: 'Kitchen Switch', model: 'Inovelli Blue', manufacturer: 'Inovelli', sw_version: '2.0', area_id: 'kitchen', labels: [], identifiers: [['zwave', 'switch-2']], connections: [] },
];

export const mockHomeAssistantEntities = [
  { entity_id: 'light.living_room', unique_id: 'hl-1', platform: 'hue', device_id: 'device-1', area_id: 'living_room', name: 'Living Room Light', original_name: 'Living Room Light', disabled_by: null, hidden_by: null, entity_category: null, icon: null, unit_of_measurement: null, device_class: null, supported_features: 1, capabilities: null },
  { entity_id: 'switch.kitchen', unique_id: 'sw-1', platform: 'zwave', device_id: 'device-2', area_id: 'kitchen', name: 'Kitchen Switch', original_name: 'Kitchen Switch', disabled_by: null, hidden_by: null, entity_category: null, icon: null, unit_of_measurement: null, device_class: null, supported_features: 1, capabilities: null },
  { entity_id: 'sensor.temperature', unique_id: 'sen-1', platform: 'hue', device_id: null, area_id: 'living_room', name: 'Temperature', original_name: 'Temperature Sensor', disabled_by: null, hidden_by: null, entity_category: 'diagnostic', icon: null, unit_of_measurement: '°F', device_class: 'temperature', supported_features: 0, capabilities: null },
  { entity_id: 'binary_sensor.motion', unique_id: 'bin-1', platform: 'hue', device_id: 'device-1', area_id: 'living_room', name: 'Motion Sensor', original_name: 'Motion Sensor', disabled_by: null, hidden_by: null, entity_category: null, icon: null, unit_of_measurement: null, device_class: 'motion', supported_features: 0, capabilities: null },
];

export const mockHomeAssistantStates = [
  { entity_id: 'light.living_room', state: 'on', attributes: { friendly_name: 'Living Room Light', brightness: 255 }, last_changed: '2026-08-26T10:00:00Z', last_updated: '2026-08-26T10:00:00Z' },
  { entity_id: 'switch.kitchen', state: 'off', attributes: { friendly_name: 'Kitchen Switch' }, last_changed: '2026-08-26T08:00:00Z', last_updated: '2026-08-26T08:00:00Z' },
  { entity_id: 'sensor.temperature', state: '72.5', attributes: { unit_of_measurement: '°F', friendly_name: 'Temperature' }, last_changed: '2026-08-26T09:30:00Z', last_updated: '2026-08-26T09:30:00Z' },
  { entity_id: 'binary_sensor.motion', state: 'on', attributes: { friendly_name: 'Motion Sensor' }, last_changed: '2026-08-26T10:05:00Z', last_updated: '2026-08-26T10:05:00Z' },
];

export const mockMySpeedSummary = {
  stats: {
    total_tests: 935,
    avg_download: 201.2,
    avg_upload: 95.8,
    avg_ping: 12.3,
    max_download: 450.0,
    max_upload: 120.0,
    min_ping: 5.0,
    latest_test: {
      id: 1,
      timestamp: Math.floor(Date.now() / 1000) - 3600,
      download: 215.3,
      upload: 98.2,
      ping: 11.5,
      server_name: 'Chicago',
      server_location: 'IL',
      server_country: 'US',
    },
  },
  recent_tests: [
    { id: 1, timestamp: Math.floor(Date.now() / 1000) - 3600, download: 215.3, upload: 98.2, ping: 11.5, jitter: 2.1, server_name: 'Chicago', server_location: 'IL', server_country: 'US' },
    { id: 2, timestamp: Math.floor(Date.now() / 1000) - 7200, download: 198.7, upload: 94.5, ping: 13.1, jitter: 3.0, server_name: 'Chicago', server_location: 'IL', server_country: 'US' },
  ],
  servers: [
    { id: 1, name: 'Chicago', location: 'IL', country: 'US', host: 'chicago.speedtest.net', port: 8080, secure: true },
    { id: 2, name: 'Dallas', location: 'TX', country: 'US', host: 'dallas.speedtest.net', port: 8080, secure: true },
  ],
};

export function mockTauriInvoke(command: string, _args?: Record<string, unknown>): Promise<unknown> {
  const mockResponses: Record<string, () => Promise<unknown>> = {
    get_servers: async () => [mockServerConfig],
    get_system_stats: async () => mockSystemStats,
    get_docker_containers: async () => mockDockerContainers,
    get_gpu_info: async () => mockGpuInfo,
    get_disks: async () => mockDisks,
    get_shares: async () => mockShares,
    get_adguard_status: async () => mockAdGuardStatus,
    get_adguard_stats: async () => mockAdGuardStats,
    get_adguard_query_log: async () => mockAdGuardQueryLog,
    get_adguard_clients: async () => mockAdGuardClients,
    get_adguard_filters: async () => mockAdGuardFilters,
    get_nextcloud_info: async () => mockNextcloudInfo,
    get_nextcloud_status: async () => mockNextcloudInfo,
    get_nextcloud_storage: async () => mockNextcloudStorage,
    get_nextcloud_users: async () => mockNextcloudUsers,
    get_nextcloud_activity: async () => mockNextcloudActivity,
    get_lidarr_status: async () => mockLidarrStatus,
    get_lidarr_artists: async () => mockLidarrArtists,
    get_lidarr_health: async () => mockLidarrHealth,
    get_lidarr_albums: async () => mockLidarrAlbums,
    get_lidarr_wanted: async () => mockLidarrWanted,
    get_lidarr_queue: async () => mockLidarrQueue,
    get_lidarr_diskspace: async () => mockLidarrDiskspace,
    lidarr_refresh_artist: async () => {},
    lidarr_search_missing: async () => {},
    get_homeassistant_states: async () => mockHomeAssistantStates,
    get_homeassistant_config: async () => mockHomeAssistantConfig,
    get_homeassistant_areas: async () => mockHomeAssistantAreas,
    get_homeassistant_devices: async () => mockHomeAssistantDevices,
    get_homeassistant_entities: async () => mockHomeAssistantEntities,
    homeassistant_toggle: async () => {},
    homeassistant_turn_on: async () => {},
    homeassistant_turn_off: async () => {},
    get_myspeed_summary: async () => mockMySpeedSummary,
    get_myspeed_tests: async () => mockMySpeedSummary.recent_tests,
    get_myspeed_servers: async () => mockMySpeedSummary.servers,
    test_connection: async () => ({ success: true, message: 'Connected', hostname: 'home-server', os: 'Unraid', services: { graphql: true, nextcloud: true, lidarr: true, homeassistant: true, myspeed: true, adguard: true } }),
    save_server: async () => {},
    remove_server: async () => {},
    docker_start: async () => 'Started',
    docker_stop: async () => 'Stopped',
    docker_restart: async () => 'Restarted',
    docker_logs: async () => 'Log line 1\nLog line 2\nLog line 3',
    docker_remove: async () => 'Removed',
    get_processes: async () => 'root 1234 0.5 1.2 /usr/bin/foo',
    get_syslog: async () => 'Aug 26 00:00:00 server kernel: test message',
    get_plugins: async () => ['plugin1', 'plugin2', 'plugin3'],
    get_network_interfaces: async () => 'eth0 UP 192.168.1.100/24',
    get_tailscale_peers: async () => '100.103.29.63 home-server',
    reboot_server: async () => 'Rebooting',
    shutdown_server: async () => 'Shutting down',
    get_array_info: async () => ({ state: 'STARTED', capacity: { disks: { free: 1000000000, used: 5000000000, total: 6000000000 } }, disks: [], caches: [] }),
    get_user_scripts: async () => 'backup.sh\ncleanup.sh',
    get_smart_data: async () => ({ device: '/dev/sda', model: 'Samsung SSD', serial: 'ABC123', capacity: '500GB', health: 'PASSED', temperature: '32C', powerOnHours: '1000', startStopCount: '100' }),
    adguard_enable: async () => {},
    adguard_disable: async () => {},
    get_adguard_dhcp: async () => ({ enabled: false, leases: [] }),
    get_docker_container_info: async () => '{"State": {"Status": "running"}}',
  };

  const handler = mockResponses[command];
  if (handler) {
    return handler();
  }
  console.warn(`Mock: Unknown command "${command}"`);
  return Promise.resolve(null);
}