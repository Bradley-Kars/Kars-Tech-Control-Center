/**
 * KTS Master Control - Configuration Loader
 * 
 * Loads and merges public config (config.example.json) with private secrets (config.private.json).
 * Private config is gitignored and contains all secrets.
 * 
 * Priority order (highest wins):
 * 1. Environment variables (highest)
 * 2. config.private.json (secrets)
 * 3. config.example.json (public defaults)
 * 4. Built-in defaults (lowest)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(PROJECT_ROOT, 'config');

interface Config {
  version: string;
  dashboard?: any;
  devices: DeviceConfig[];
  groups?: any[];
  integrations?: any;
  secrets?: any;
  environment?: Record<string, string>;
}

interface DeviceConfig {
  id: string;
  name: string;
  type: string;
  role: string;
  description?: string;
  icon?: string;
  location?: string;
  tags?: string[];
  capabilities?: string[];
  dashboard?: any;
  // Private fields (from private config)
  ssh?: any;
  meshcentral?: any;
  services?: any;
  adb?: any;
  termux?: any;
  kdeconnect?: any;
  termuxBootScript?: string;
  local?: boolean;
}

interface LoadedConfig {
  public: any;
  private: any;
  merged: Config;
  deviceMap: Map<string, any>;
  secrets: any;
}

let cachedConfig: LoadedConfig | null = null;

/**
 * Deep merge two objects, with source overwriting target
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result: Record<string, any> = { ...target };
  
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];
    
    if (sourceValue === undefined) continue;
    
    if (
      sourceValue !== null &&
      targetValue !== null &&
      typeof sourceValue === 'object' &&
      typeof targetValue === 'object' &&
      !Array.isArray(sourceValue) &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else {
      result[key] = sourceValue as any;
    }
  }
  
  return result as T;
}

/**
 * Load a JSON file with error handling
 */
function loadJsonFile(filePath: string): any | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`[Config] Failed to load ${filePath}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Apply environment variable overrides
 * Format: KTS_DEVICE_UNRAID_SERVER_SSH_PASSWORD=secret
 */
function applyEnvOverrides(config: any): void {
  const prefix = 'KTS_';
  
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith(prefix)) continue;
    
    const path = key.slice(prefix.length)
      .toLowerCase()
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('.');
    
    setNestedValue(config, path, value);
  }
}

function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part];
  }
  
  // Try to parse as JSON, fallback to string
  let parsedValue: any = value;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    // Keep as string
  }
  
  current[parts[parts.length - 1]] = parsedValue;
}

/**
 * Load and merge all configuration sources
 */
export function loadConfig(forceReload = false): LoadedConfig {
  if (cachedConfig && !forceReload) {
    return cachedConfig;
  }

  // 1. Load public config (config.example.json)
  const publicConfigPath = path.join(CONFIG_DIR, 'config.example.json');
  const publicConfig = loadJsonFile(publicConfigPath);
  
  if (!publicConfig) {
    throw new Error(`Failed to load public config from ${publicConfigPath}`);
  }

  // 2. Load private config (config.private.json) - gitignored
  const privateConfigPath = path.join(CONFIG_DIR, 'config.private.json');
  const privateConfig = loadJsonFile(privateConfigPath);

  // 3. Merge configs
  const mergedConfig = deepMerge(publicConfig, privateConfig || {});

  // 4. Apply environment variable overrides
  applyEnvOverrides(mergedConfig);

  // 5. Build device map for quick lookups
  const deviceMap = new Map<string, any>();
  for (const device of mergedConfig.devices || []) {
    deviceMap.set(device.id, device);
  }

  // 6. Extract secrets
  const secrets = mergedConfig.secrets || {};

  // 7. Apply environment variable overrides to process.env for runtime access
  if (mergedConfig.environment) {
    for (const [key, value] of Object.entries(mergedConfig.environment)) {
      if (!process.env[key]) {
        process.env[key] = String(value);
      }
    }
  }

  const loadedConfig: LoadedConfig = {
    public: publicConfig,
    private: privateConfig || {},
    merged: mergedConfig,
    deviceMap,
    secrets
  };

  cachedConfig = loadedConfig;
  return loadedConfig;
}

/**
 * Get merged config (with secrets merged in)
 */
export function getConfig(): Config {
  return loadConfig().merged;
}

/**
 * Get public config only (safe for client-side)
 */
export function getPublicConfig(): any {
  return loadConfig().public;
}

/**
 * Get device config by ID (with secrets merged)
 */
export function getDeviceConfig(deviceId: string): any | null {
  const { deviceMap, private: privateConfig } = loadConfig();
  
  const publicDevice = deviceMap.get(deviceId);
  if (!publicDevice) return null;

  // Merge with private device config
  const privateDevice = privateConfig?.devices?.[deviceId] || {};
  return deepMerge(publicDevice, privateDevice);
}

/**
 * Get device SSH config
 */
export function getDeviceSSHConfig(deviceId: string): any | null {
  const device = getDeviceConfig(deviceId);
  return device?.ssh || null;
}

/**
 * Get device MeshCentral config
 */
export function getDeviceMeshCentralConfig(deviceId: string): any | null {
  const device = getDeviceConfig(deviceId);
  return device?.meshcentral || null;
}

/**
 * Get device service configs
 */
export function getDeviceServices(deviceId: string): any | null {
  const device = getDeviceConfig(deviceId);
  return device?.services || null;
}

/**
 * Get all secrets
 */
export function getSecrets(): any {
  return loadConfig().secrets;
}

/**
 * Get integration config (with secrets)
 */
export function getIntegrationConfig(name: string): any | null {
  const { merged, private: privateConfig } = loadConfig();
  const publicIntegration = merged.integrations?.[name] || {};
  const privateIntegration = privateConfig?.integrations?.[name] || {};
  return deepMerge(publicIntegration, privateIntegration);
}

/**
 * Get all devices
 */
export function getDevices(): any[] {
  return loadConfig().merged.devices || [];
}

/**
 * Get devices by role
 */
export function getDevicesByRole(role: string): any[] {
  return loadConfig().merged.devices?.filter((d: any) => d.role === role) || [];
}

/**
 * Get devices by capability
 */
export function getDevicesByCapability(capability: string): any[] {
  return loadConfig().merged.devices?.filter((d: any) => 
    d.capabilities?.includes(capability)
  ) || [];
}

/**
 * Get groups
 */
export function getGroups(): any[] {
  return loadConfig().merged.groups || [];
}

/**
 * Get dashboard settings
 */
export function getDashboardConfig(): any {
  return loadConfig().merged.dashboard || {};
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development' || 
         process.env.KTS_DEV === 'true';
}

/**
 * Clear cache (useful for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

export { loadConfig as reloadConfig };
export default { loadConfig, getConfig, getPublicConfig, getDeviceConfig, getDeviceSSHConfig, getDeviceMeshCentralConfig, getDeviceServices, getSecrets, getIntegrationConfig, getDevices, getDevicesByRole, getDevicesByCapability, getGroups, getDashboardConfig, isDevelopment, clearConfigCache };