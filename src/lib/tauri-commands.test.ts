import { describe, it, expect, vi } from 'vitest';
import { meshcentralGetFleetStats, meshcentralGetSystemStats } from './tauri-commands';

// Simulate a non-Tauri (sandbox / dev) environment: tauri's `invoke` is
// undefined and the Tauri-availability check reports false. This is the exact
// condition that produced MESH-001: "Cannot read properties of undefined
// (reading 'invoke')" — two persistent red crash toasts on /meshcentral.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: undefined,
  isTauri: vi.fn(() => false),
  Channel: class {},
}));

describe('tauri-commands IPC guard (MESH-001)', () => {
  it('throws a friendly "Tauri IPC not available" error instead of crashing with "Cannot read properties of undefined (reading \'invoke\')"', async () => {
    await expect(meshcentralGetFleetStats()).rejects.toThrow(/Tauri IPC not available/);
    await expect(meshcentralGetSystemStats('s1')).rejects.toThrow(/Tauri IPC not available/);
  });

  it('never throws TypeError "Cannot read properties of undefined" (the MESH-001 crash)', async () => {
    await expect(meshcentralGetFleetStats()).rejects.not.toThrow(/Cannot read properties of undefined/);
    await expect(meshcentralGetSystemStats('s1')).rejects.not.toThrow(/Cannot read properties of undefined/);
  });
});
