// KTS Master Control — Tauri command adapters (deprecated).
//
// Every former `invoke('<command>', ...)` wrapper now resolves to the pure
// fetch bridge in `./bridge.ts`. This module exists only to keep existing
// import sites (`../lib/tauri-commands`) working without the Tauri runtime.
// The `src-tauri/` directory has been deleted; `@tauri-apps/api` is no longer
// a dependency. See `src/lib/bridge.ts` for the transport implementation.
//
// Type aliases that callers import from this module are re-exported here so
// existing import sites do not need to change.

export * from './bridge';

export type {
  Alert,
  AlertFilter,
  AlertSeverity,
  MetricPoint,
  MetricSeries,
} from './types';
