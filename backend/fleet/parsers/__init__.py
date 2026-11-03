"""backend/fleet/parsers/ — hardware telemetry parsers ported from src-tauri.

Mirrors src-tauri/src/parsers/nvidia.rs and src-tauri/src/parsers/smart.rs:
each turns raw command output into a plain dict shaped like the frontend's
GpuInfo / SmartInfo types. No real hardware or binaries are required — the
parsers work on captured text only.
"""
