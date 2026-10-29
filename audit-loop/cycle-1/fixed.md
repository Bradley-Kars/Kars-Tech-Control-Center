# Cycle 1 Fix Log

## P0 Fixes

### MESH-001 — MeshCentral toast crash "Cannot read properties of undefined (reading 'invoke')"
- Root cause: `src/lib/tauri-commands.ts` imports `invoke` from `@tauri-apps/api/core` and calls it directly (~60 sites). In sandbox/dev mode there is no `window.__TAURI__`, so `invoke` throws a raw, unfriendly error that surfaces as persistent red crash toasts on /meshcentral.
- Fix: Wrap `invoke` with a Tauri-availability guard (`isTauri = typeof window !== 'undefined' && !!window.__TAURI__`). When Tauri is unavailable, throw a friendly `Tauri IPC not available: <cmd>` error instead of the raw crash. Single change at the import site fixes all commands.
- File: `src/lib/tauri-commands.ts`
- Status: in_progress

### MESH-002 — MeshCentral toast errors stack unboundedly
- File: `src/components/ui/Toast.tsx`
- Status: pending

## P1 Fixes
(pending — queue built from UI_AUDIT_REPORT.md Section 4)

- MESH-001: FIXED — wrapped `invoke` in `src/lib/tauri-commands.ts` with Tauri-availability guard; friendly error instead of raw crash. Commit pending.
