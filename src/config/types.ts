/**
 * KTS Master Control - Configuration Types
 * 
 * Type definitions matching config.schema.json
 */

export interface KTSConfig {
  version: string;
  dashboard?: DashboardConfig;
  devices: DeviceConfig[];
  groups?: DeviceGroup[];
  integrations?: IntegrationsConfig;
  secrets?: SecretsConfig;
  environment?: Record<string, string>;
}

export interface DashboardConfig {
  defaultTimeRange?: '1h' | '6h' | '24h' | '7d' | '30d';
  autoRefreshInterval?: number;
  kioskMode?: boolean;
  theme?: 'system' | 'light' | 'dark';
}

export interface DeviceConfig {
  id: string;
  name: string;
  type: DeviceType;
  role: DeviceRole;
  description?: string;
  icon?: string;
  location?: string;
  tags?: string[];
  capabilities?: Capability[];
  dashboard?: DeviceDashboardConfig;
  // Private fields (from private config)
  ssh?: SSHConfig;
  meshcentral?: MeshCentralConfig;
  services?: ServicesConfig;
  adb?: ADBConfig;
  termux?: TermuxConfig;
  kdeconnect?: KDEConnectConfig;
  termuxBootScript?: string;
  local?: boolean;
}

export type DeviceType = 
  | 'unraid' 
  | 'linux' 
  | 'bazzite' 
  | 'windows' 
  | 'android' 
  | 'router' 
  | 'proxmox';

export type DeviceRole = 
  | 'server' 
  | 'workstation' 
  | 'handheld' 
  | 'phone' 
  | 'htpc' 
  | 'router' 
  | 'nas' 
  | 'proxmox';

export type Capability = 
  | 'ssh' 
  | 'meshcentral' 
  | 'docker' 
  | 'kdeconnect' 
  | 'adb'
  | 'ipmi' 
  | 'redfish' 
  | 'snmp' 
  | 'prometheus' 
  | 'node-exporter'
  | 'docker-api' 
  | 'kubernetes' 
  | 'libvirt' 
  | 'proxmox-api'
  | 'unraid-api' 
  | 'truenas-api' 
  | 'synology-api' 
  | 'qnap-api';

export interface DeviceDashboardConfig {
  position?: GridPosition;
  widgets?: DashboardWidget[];
}

export interface GridPosition {
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  static?: boolean;
}

export type DashboardWidget = 
  | 'vitals' 
  | 'cpu' 
  | 'memory' 
  | 'disk' 
  | 'network' 
  | 'gpu'
  | 'docker' 
  | 'services' 
  | 'processes' 
  | 'logs' 
  | 'temperature'
  | 'battery' 
  | 'storage' 
  | 'uptime' 
  | 'alerts' 
  | 'backup';

export interface DeviceGroup {
  id: string;
  name: string;
  description?: string;
  deviceIds: string[];
  icon?: string;
  color?: string;
}

export interface SSHConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  keyPath?: string;
  passphrase?: string;
  timeout?: number;
}

export interface MeshCentralConfig {
  deviceId?: string;
  serverUrl?: string;
  groupId?: string;
}

export interface ServicesConfig {
  unraid?: { apiKey: string; url?: string };
  plex?: { token: string; url?: string };
  nextcloud?: { url: string; user: string; pass: string };
  qbittorrent?: { url: string; user: string; pass: string };
  radarr?: { url: string; apiKey: string };
  sonarr?: { url: string; apiKey: string };
  lidarr?: { url: string; apiKey: string };
  prowlarr?: { url: string; apiKey: string };
  homeassistant?: { url: string; token: string };
  adguard?: { url: string; user: string; pass: string };
  shoko?: { url: string; apiKey: string; user: string; pass: string };
  flaresolverr?: { url: string };
  [key: string]: any;
}

export interface ADBConfig {
  host: string;
  port: number;
  serial?: string;
}

export interface TermuxConfig {
  host: string;
  port: number;
  username: string;
  keyPath?: string;
  password?: string;
  bootScript?: string;
}

export interface KDEConnectConfig {
  deviceId: string;
  pair?: boolean;
}

export interface IntegrationsConfig {
  meshcentral?: {
    enabled: boolean;
    serverUrl?: string;
    adminUser?: string;
    adminPass?: string;
    groupId?: string;
    groupName?: string;
  };
  homeassistant?: {
    enabled: boolean;
    url?: string;
    token?: string;
  };
  prometheus?: {
    enabled: boolean;
    url?: string;
  };
  grafana?: {
    enabled: boolean;
    url?: string;
    apiKey?: string;
  };
  proxmox?: {
    enabled: boolean;
    url?: string;
    user?: string;
    password?: string;
    tokenId?: string;
    tokenSecret?: string;
  };
  vaultwarden?: {
    enabled: boolean;
    url?: string;
    adminToken?: string;
  };
  [key: string]: any;
}

export interface SecretsConfig {
  meshcentral?: {
    url?: string;
    adminUser?: string;
    adminPass?: string;
    groupId?: string;
  };
  meshcentralLocal?: {
    url?: string;
    adminUser?: string;
    adminPass?: string;
  };
  tailscale?: {
    apiKey?: string;
    tailnet?: string;
  };
  rustdesk?: {
    serverHost?: string;
    serverPorts?: string;
    serverKey?: string;
  };
  proxmox?: {
    url?: string;
    user?: string;
    password?: string;
    tokenId?: string;
    tokenSecret?: string;
  };
  vaultwarden?: {
    url?: string;
    adminToken?: string;
  };
  [key: string]: any;
}

export interface EnvironmentConfig {
  NODE_ENV?: 'development' | 'production' | 'test';
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
  METRICS_PORT?: string;
  [key: string]: string | undefined;
}

export interface LoadedConfig {
  public: any;
  private: any;
  merged: any;
  deviceMap: Map<string, any>;
  secrets: any;
}

// Re-export loader functions
export { 
  loadConfig, 
  getConfig, 
  getPublicConfig, 
  getDeviceConfig, 
  getDeviceSSHConfig, 
  getDeviceMeshCentralConfig, 
  getDeviceServices, 
  getSecrets, 
  getIntegrationConfig, 
  getDevices, 
  getDevicesByRole, 
  getDevicesByCapability, 
  getGroups, 
  getDashboardConfig, 
  isDevelopment, 
  clearConfigCache,
  reloadConfig 
} from './loader';