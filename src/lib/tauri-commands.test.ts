import { describe, it, expect, vi } from 'vitest';
import { meshcentralGetFleetStats, meshcentralGetSystemStats } from './tauri-commands';

// Simulate a non-Tauri (sandbox / dev) environment: tauri's `invoke` is
// undefined and the Tauri-availability check reports false. MeshCentral
// commands are now ported to fleet-api (fetch), so they must NOT crash with
// "Cannot read properties of undefined (reading 'invoke')" (MESH-001).
// Instead they throw a FleetApiError (network failure) since there is no
// backend in the test environment.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: undefined,
  isTauri: vi.fn(() => false),
  Channel: class {},
}));

describe('tauri-commands IPC guard (MESH-001)', () => {
  it('does not crash with "Cannot read properties of undefined (reading \'invoke\')" — MeshCentral uses fetch now', async () => {
    // meshcentralGetFleetStats now takes serverId and uses fleet-api fetch.
    // No Tauri invoke is involved, so no TypeError about undefined invoke.
    await expect(meshcentralGetFleetStats('s1')).rejects.not.toThrow(/Cannot read properties of undefined/);
    await expect(meshcentralGetSystemStats('s1')).rejects.not.toThrow(/Cannot read properties of undefined/);
  });

  it('throws a FleetApiError (network failure) rather than a Tauri IPC error', async () => {
    const err = await meshcentralGetFleetStats('s1').catch((e: Error) => e);
    expect(err.message).not.toMatch(/Tauri IPC not available/);
    expect(err).toBeInstanceOf(Error);
  });
});
