"""backend/fleet/parsers/ — hardware telemetry parsers ported from the
original Rust code.

Mirrors the original Rust nvidia and smart parsers:
each turns raw command output into a plain dict shaped like the frontend's
GpuInfo / SmartInfo types. No real hardware or binaries are required — the
parsers work on captured text only.
"""
