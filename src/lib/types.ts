export type ConnectionMethod = 'meshcentral' | 'ssh' | 'graphql' | 'adb' | 'kdeconnect';

export interface MeshCentralConfig {
  server_url?: string;
  admin_user?: string;
  admin_pass?: string;
  group_id?: string;
  group_name?: string;
}

export interface MeshDevice {
  id: string;
  name: string;
  group: string;
  conn: number;
  pwr: number;
  platform: string;
  ip: string;
  last_connect?: string;
}

export interface DeviceStatus {
  connected: boolean;
  cpu_usage?: number;
  memory_usage_pct?: number;
  uptime?: string;
  source: ConnectionMethod;
}

export interface BatchCommand {
  command: string;
  args?: string[];
}

export interface BatchResult {
  device_id: string;
  success: boolean;
  output: string;
  error?: string;
}

export interface EnrollmentInfo {
  agent_url: string;
  settings_url: string;
  group_id: string;
  install_command_linux: string;
  install_command_windows: string;
}

export interface SyncResult {
  devices_found: number;
  devices_matched: number;
  devices_new: number;
  devices_updated: number;
  errors: string[];
}

// MeshCentral Transport Types (2026-10-08)
export interface ShellResult {
  device_id: string;
  command: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  success: boolean;
}

export interface RemoteFileInfo {
  path: string;
  is_dir: boolean;
  size?: number;
  modified?: string;
  permissions?: string;
}

export interface RemoteProcess {
  pid: number;
  name: string;
  cpu_percent?: number;
  memory_percent?: number;
  user?: string;
  command?: string;
}

export interface MeshSystemStats {
  hostname: string;
  kernel: string;
  os_release: string;
  arch: string;
  uptime: string;
  cpu_usage: number;
  cpu_cores: number;
  cpu_threads: number;
  cpu_brand: string;
  memory_total_mb: number;
  memory_used_mb: number;
  memory_free_mb: number;
  memory_usage_pct: number;
  swap_total_mb?: number;
  swap_used_mb?: number;
  cpu_speed_ghz?: number;
  load_avg: [number, number, number];
  platform: string;
  source: string;
}

// Alert Center Types (2026-10-08)
export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface Alert {
  id?: number;
  severity: AlertSeverity;
  title: string;
  message: string;
  device_id?: string;
  source: string;
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  created_at: string;
  updated_at: string;
  auto_ack_rule?: string;
}

export interface AlertFilter {
  severity?: AlertSeverity;
  device_id?: string;
  acknowledged?: boolean;
  since?: string;
  limit?: number;
  offset?: number;
}

// Historical Metrics Types (2026-10-08)
export interface MetricPoint {
  timestamp: string;
  value: number;
}

export interface MetricSeries {
  metric: string;
  device_id: string;
  points: MetricPoint[];
}

export interface ServerConfig {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  auth: { type: 'password'; password: string } | { type: 'key'; key_path: string; passphrase?: string };
  device_type: string;
  api_key?: string;
  service_keys?: ServiceKeys;
  // MeshCentral integration (2026-10-07)
  meshcentral_device_id?: string;
  meshcentral_enrolled_at?: string;
  meshcentral_status?: string;
  connection_priority?: ConnectionMethod[];
}

export interface ServiceKeys {
  nextcloud_user?: string;
  nextcloud_pass?: string;
  lidarr_api_key?: string;
  homeassistant_token?: string;
  adguard_user?: string;
  adguard_pass?: string;
  adguard_url?: string;
  myspeed_db_path?: string;
  myspeed_url?: string;
  // Auto-discovered 2026-08-30 — same pattern as Home Assistant
  plex_url?: string;
  plex_token?: string;
  scrutiny_url?: string;
  uptimekuma_url?: string;
  uptimekuma_slug?: string;
  invoiceninja_url?: string;
  invoiceninja_token?: string;
  aurral_url?: string;
  aurral_user?: string;
  aurral_pass?: string;
  your_spotify_url?: string;
  your_spotify_api_key?: string;
  dozzle_url?: string;
  homepage_url?: string;
  phone_adb_serial?: string;
  phone_rustdesk_id?: string;
  phone_rustdesk_password?: string;
  kdeconnect_device_id?: string;
  steamdeck_rustdesk_id?: string;
  steamdeck_rustdesk_password?: string;
  steamdeck_kdeconnect_device_id?: string;

  // --- Verified-live fleet services (2026-09-29) --------------------------
  // Mirrors the Rust `ServiceKeys` struct in src-tauri/src/config.rs. Both
  // halves must stay in sync: a key present on only one side is silently
  // dropped by serde, which is how the services lost their credentials
  // without any error surfacing. Only add keys that probe green.

  // Unraid host
  unraid_url?: string;
  lan_ip?: string;
  tailscale_ip?: string;

  // Arr stack + download client
  lidarr_url?: string;
  radarr_url?: string;
  radarr_api_key?: string;
  sonarr_url?: string;
  sonarr_api_key?: string;
  prowlarr_url?: string;
  prowlarr_api_key?: string;
  qbittorrent_url?: string;
  qbittorrent_user?: string;
  qbittorrent_pass?: string;
  flaresolverr_url?: string;

  // Media
  plex_user_id?: string;
  shoko_url?: string;
  shoko_api_key?: string;
  shoko_user?: string;
  shoko_pass?: string;

  // Home automation
  homeassistant_url?: string;
  matter_hub_url?: string;

  // Business / files
  nextcloud_url?: string;
  ombi_url?: string;

  // Infrastructure services
  mosquitto_host?: string;
  mosquitto_port?: string;
  mariadb_host?: string;
  mariadb_port?: string;
  rustdesk_server_host?: string;
  rustdesk_server_ports?: string;

  // Misc
  bing_api_key?: string;

  // Device-local facts
  phone_ssh?: string;
  phone_ssh_auth?: string;
  mac_address?: string;
  os?: string;
  cpu?: string;
  gpu?: string;
  nfs_export?: string;
  nfs_unraid_mount?: string;
  sunshine_webui?: string;
  sunshine_stream?: string;
  sunshine_user?: string;
  sunshine_pass?: string;
  deskflow_client?: string;
  sshfs_mount_kars?: string;
  sshfs_mount_shared?: string;
  lan_eth_reserved?: string;
  lan_wifi_reserved?: string;
  notes?: string;
}

export interface SystemStats {
  hostname: string;
  kernel: string;
  uptime: string;
  cpu_usage: number;
  cpu_cores: number;
  memory_total_mb: number;
  memory_used_mb: number;
  memory_usage_pct: number;
  load_avg: number[];
  array_state: string;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  autoStart: boolean;
}

export interface GpuInfo {
  name: string;
  driver_version: string;
  cuda_version: string;
  temperature: string;
  power_usage: string;
  power_cap: string;
  memory_used: string;
  memory_total: string;
  utilization: string;
  fan_speed: string;
}

export interface DiskInfo {
  name: string;
  device: string;
  type: string;
  size: number;
  vendor: string;
  temperature: number | null;
  smartStatus: string;
  isSpinning: boolean;
  /**
   * Filesystem figures merged in from the Unraid `array.disks` query.
   * Optional because that second query can fail independently — the device
   * list still renders, just without the usage bar.
   */
  free?: number;
  fsSize?: number;
  fsUsed?: number;
}

export interface ShareInfo {
  name: string;
  comment: string;
  allocator: string;
  cache: boolean | null;
  size: number;
  free: number;
  used: number;
}

export interface SmartInfo {
  device: string;
  model: string;
  capacity: string;
  power_on_hours: string | null;
  temperature: string | null;
  reallocated_sectors: string | null;
  pending_sectors: string | null;
  health: string;
}

export interface ServiceTestResults {
  graphql: boolean;
  nextcloud: boolean;
  lidarr: boolean;
  homeassistant: boolean;
  myspeed: boolean;
  adguard: boolean;
  plex: boolean;
  scrutiny: boolean;
  uptimekuma: boolean;
  invoiceninja: boolean;
  aurral: boolean;
  your_spotify: boolean;
  dozzle: boolean;
  phone: boolean;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  hostname: string;
  os: string;
  services: ServiceTestResults;
}

export interface KdeConnectBattery {
  charge: number;
  is_charging: boolean;
  has_battery: boolean;
  icon_name: string;
}

export interface KdeConnectNotification {
  id: string;
  app_name: string;
  title: string;
  text: string;
  icon_name?: string;
  urgency?: string;
  timestamp?: number;
}

export interface SmsMessage {
  id: number;
  address: string;
  body: string;
  date: number;
  read: boolean;
  type_: string;
}

export interface SmsConversation {
  address: string;
  contact_name?: string;
  last_message: string;
  last_timestamp: number;
  unread_count: number;
  message_count: number;
}

export interface KdeConnectMprisStatus {
  player: string;
  player_list: string[];
  title: string;
  artist: string;
  album: string;
  is_playing: boolean;
  can_seek: boolean;
  volume: number;
  position: number;
  length: number;
  local_album_art_url: string;
}

export interface KdeConnectConnectivity {
  cellular_network_strength: number;
  cellular_network_type: string;
  icon_name: string;
}

export interface KdeConnectTelephony {
  is_ringing: boolean;
  is_active: boolean;
  number?: string;
  name?: string;
}

export interface KdeConnectContact {
  uid: string;
  name: string;
  phone_numbers: string[];
  emails: string[];
}

export interface KdeConnectConversation {
  thread_id: number;
  address: string;
  body: string;
  date: number;
  read: boolean;
  message_count: number;
}

export interface ContactInfo {
  id: number;
  display_name: string;
  phone_numbers: string[];
}

export interface CallLogEntry {
  id: number;
  number: string;
  name?: string;
  type_: string;
  date: number;
  duration: number;
}

export interface KdeConnectDeviceInfo {
  id: string;
  name: string;
  device_type: string;
  is_paired: boolean;
  is_reachable: boolean;
  icon_name: string;
}

export interface KdeConnectFile {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
  mime_type?: string;
}

// --- REST services (plex, scrutiny, uptime kuma, invoice ninja, ...) -------
// These were added to `ServiceKeys` on the TS side in 2026-08-30 but had no
// Rust counterpart, so serde dropped them on load and the services could not
// connect. Both halves now exist.

export interface RestServiceHealth {
  service: string;
  label: string;
  url: string;
  reachable: boolean;
  detail: string;
}

export interface PlexIdentity {
  machine_identifier: string;
  version: string;
  claimed: boolean;
}

export interface PlexLibrary {
  key: string;
  title: string;
  library_type: string;
  uuid: string;
  scanning: boolean;
  updated_at: number;
}

// --- OpenCode chat (sidecar) -------------------------------------------------
export interface OpencodeStatus {
  running: boolean;
  port: number | null;
  pid: number | null;
}

export interface ChatMessage {
  role: string; // "user" | "assistant" | "tool" | "system"
  text: string;
}
