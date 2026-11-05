"""backend/mcp/server.py

stdio MCP server for KTS Master Control (Phase 8, M2).

JSON-RPC 2.0, newline-delimited, MCP protocol 2025-06-18 — the same framing
as the deleted Rust `cli` MCP server. Exposes the read-only tools from
docs/mcp/TOOLS.md and proxies each one to its matching /api/fleet route on
the web backend, reached over HTTP with KTS_API_URL + KTS_API_TOKEN from the
environment.

This module never reads servers.json itself — the backend owns the server
registry and every route is identity-enforced by create_app's middleware
(401 without a token).

Methods:
  initialize        -> protocol version, capabilities, server info
  initialized       -> notification, no response
  tools/list        -> the read-only tool catalogue
  tools/call        -> proxy one tool to its /api/fleet route

Backend answers:
  200          -> content = parsed JSON body
  401 / 403    -> JSON-RPC error -32603 (the MCP server's own credentials
                  are bad; the MCP layer reports it as an error)
  other >= 400 -> content {"status": <code>, "error": <detail>}
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

import httpx

API_URL_ENV = "KTS_API_URL"
API_TOKEN_ENV = "KTS_API_TOKEN"

PROTOCOL_VERSION = "2025-06-18"
SERVER_NAME = "kts-master-control"
SERVER_VERSION = "1.0.0"

ERR_PARSE = -32700
ERR_METHOD_NOT_FOUND = -32601
ERR_INVALID_PARAMS = -32602
ERR_INTERNAL = -32603

AUTH_ERROR_STATUSES = frozenset({401, 403})

# tool -> {description, method, route, params, required}
# route is None for "no route yet" tools (docs/mcp/TOOLS.md).
TOOLS: dict[str, dict[str, Any]] = {
    "mc_list_servers": {
        "description": "List every configured server with id, name, hostname, device_type, and MeshCentral status.",
        "method": "GET",
        "route": "/api/fleet/servers",
        "params": [],
        "required": [],
    },
    "mc_list_devices": {
        "description": "List all devices known to MeshCentral: id, name, group, connection state, platform, IP.",
        "method": "GET",
        "route": "/api/fleet/meshcentral/list_devices",
        "params": ["device_id"],
        "required": ["device_id"],
    },
    "mc_fleet_stats": {
        "description": "Aggregate fleet stats: server count, MeshCentral online/offline counts, device types.",
        "method": "GET",
        "route": "/api/fleet/meshcentral/get_fleet_stats",
        "params": [],
        "required": [],
    },
    "mc_device_status": {
        "description": "Get live status of a MeshCentral device: connected, CPU usage, memory usage, uptime, data source.",
        "method": "GET",
        "route": "/api/fleet/meshcentral/get_device_status",
        "params": ["device_id"],
        "required": ["device_id"],
    },
    "mc_system_stats": {
        "description": "Get detailed system stats for a server (Unraid): CPU, memory, disks, network, uptime.",
        "method": "GET",
        "route": "/api/fleet/system/stats",
        "params": ["server_id"],
        "required": ["server_id"],
    },
    "mc_alert_list": {
        "description": "List alerts from the local alert store. Optional filters: severity, device_id, acknowledged.",
        "method": "GET",
        "route": "/api/fleet/alerts/list",
        "params": ["severity", "device_id", "acknowledged"],
        "required": [],
    },
    "mc_alert_get": {
        "description": "Get a single alert by id.",
        "method": "GET",
        "route": "/api/fleet/alerts/get",
        "params": ["id"],
        "required": ["id"],
    },
    "mc_adguard_status": {
        "description": "Get AdGuard Home DNS protection status for a server.",
        "method": "GET",
        "route": "/api/fleet/adguard/status",
        "params": ["server_id"],
        "required": ["server_id"],
    },
    "mc_docker_containers": {
        "description": "List Docker containers on a server: name, image, state, status.",
        "method": "GET",
        "route": "/api/fleet/unraid/get_docker_containers",
        "params": ["server_id"],
        "required": ["server_id"],
    },
    "mc_array_info": {
        "description": "Get Unraid array status: drives, health, capacity, parity.",
        "method": "GET",
        "route": "/api/fleet/unraid/get_array_info",
        "params": ["server_id"],
        "required": ["server_id"],
    },
    "mc_prometheus_health": {
        "description": "Check if a Prometheus server is reachable and ready. Returns true/false.",
        "method": "GET",
        "route": None,
        "params": ["base_url"],
        "required": ["base_url"],
    },
    "mc_prometheus_query": {
        "description": "Run a PromQL range query. start/end are RFC3339 or unix timestamps; step is a duration string.",
        "method": "GET",
        "route": None,
        "params": ["base_url", "query", "start", "end", "step"],
        "required": ["base_url", "query", "start", "end", "step"],
    },
}


def _schema(required: list[str], props: dict[str, Any]) -> dict[str, Any]:
    """JSON Schema inputSchema for one tool (no extra properties)."""
    return {
        "type": "object",
        "properties": props,
        "required": required,
        "additionalProperties": False,
    }


TOOL_SPECS: dict[str, dict[str, Any]] = {
    "mc_list_servers": _schema([], {}),
    "mc_list_devices": _schema(
        ["device_id"],
        {"device_id": {"type": "string", "description": "MeshCentral device id (from mc_list_servers)."}},
    ),
    "mc_fleet_stats": _schema([], {}),
    "mc_device_status": _schema(
        ["device_id"],
        {"device_id": {"type": "string", "description": "MeshCentral device id."}},
    ),
    "mc_system_stats": _schema(
        ["server_id"],
        {"server_id": {"type": "string", "description": "Short server id (from mc_list_servers)."}},
    ),
    "mc_alert_list": _schema(
        [],
        {
            "severity": {"type": "string", "description": "Filter: critical, warning or info."},
            "device_id": {"type": "string", "description": "Filter by device id."},
            "acknowledged": {
                "type": "boolean",
                "description": "Filter by acknowledged state.",
            },
        },
    ),
    "mc_alert_get": _schema(
        ["id"],
        {"id": {"type": "integer", "description": "Alert id."}},
    ),
    "mc_adguard_status": _schema(
        ["server_id"],
        {"server_id": {"type": "string", "description": "Short server id (from mc_list_servers)."}},
    ),
    "mc_docker_containers": _schema(
        ["server_id"],
        {"server_id": {"type": "string", "description": "Short server id (from mc_list_servers)."}},
    ),
    "mc_array_info": _schema(
        ["server_id"],
        {"server_id": {"type": "string", "description": "Short server id (from mc_list_servers)."}},
    ),
    "mc_prometheus_health": _schema(
        ["base_url"],
        {"base_url": {"type": "string", "description": "Prometheus base URL."}},
    ),
    "mc_prometheus_query": _schema(
        ["base_url", "query", "start", "end", "step"],
        {
            "base_url": {"type": "string", "description": "Prometheus base URL."},
            "query": {"type": "string", "description": "PromQL range query."},
            "start": {"type": "string", "description": "Start time (RFC3339 or unix seconds)."},
            "end": {"type": "string", "description": "End time (RFC3339 or unix seconds)."},
            "step": {"type": "string", "description": "Step duration (e.g. 1m, 15s)."},
        },
    ),
}


def _rpc_error(msg_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}


def _rpc_data_error(msg_id: Any, code: int, data: str) -> dict[str, Any]:
    """JSON-RPC error whose `error.data` carries the caller-facing payload."""
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "data": data}}


def _rpc_result(msg_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


def _send(message: dict[str, Any]) -> None:
    assert sys.stdout is not None
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


def _tool_list() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for name, spec in TOOLS.items():
        out.append(
            {
                "name": name,
                "description": spec["description"],
                "inputSchema": TOOL_SPECS[name],
            }
        )
    return out


def _call_tool(
    name: Any,
    arguments: Any,
    client: httpx.Client,
    base_url: str,
    token: str,
) -> tuple[str, dict[str, Any]]:
    """Return ("rpc_error", error) or ("content", body)."""
    if not isinstance(name, str) or name not in TOOLS:
        return ("rpc_error", _rpc_error(None, ERR_INVALID_PARAMS, f"unknown tool {name!r}"))

    spec = TOOLS[name]
    if spec["route"] is None:
        return (
            "rpc_error",
            _rpc_error(None, ERR_INTERNAL, f"tool {name!r} has no /api/fleet route yet"),
        )

    if not isinstance(arguments, dict):
        return (
            "rpc_error",
            _rpc_error(None, ERR_INVALID_PARAMS, "arguments must be an object"),
        )

    missing = [k for k in spec["required"] if k not in arguments]
    if missing:
        return (
            "rpc_error",
            _rpc_error(
                None,
                ERR_INVALID_PARAMS,
                f"missing required arguments: {', '.join(missing)}",
            ),
        )

    query = {k: arguments[k] for k in spec["params"] if k in arguments}
    url = base_url + spec["route"]
    try:
        resp = client.request(
            spec["method"], url, params=query, headers={"X-API-Token": token}
        )
    except httpx.RequestError as exc:
        return (
            "rpc_error",
            _rpc_error(None, ERR_INTERNAL, f"backend unreachable: {exc}"),
        )

    if resp.status_code in AUTH_ERROR_STATUSES:
        return (
            "rpc_error",
            _rpc_data_error(
                None,
                ERR_INTERNAL,
                f"backend returned {resp.status_code}: {resp.text[:300]}",
            ),
        )

    if resp.status_code >= 400:
        try:
            body = resp.json()
        except ValueError:
            body = {"detail": resp.text}
        detail = body.get("detail", body) if isinstance(body, dict) else body
        return ("content", {"status": resp.status_code, "error": detail})

    try:
        return ("content", resp.json())
    except ValueError:
        return ("content", {"status": resp.status_code, "text": resp.text})


def main() -> None:
    base_url = os.environ.get(API_URL_ENV, "").rstrip("/")
    token = os.environ.get(API_TOKEN_ENV, "")
    client = httpx.Client(timeout=httpx.Timeout(10.0))
    try:
        while True:
            line = sys.stdin.readline()
            if line is None or line == "":
                break
            line = line.strip()
            if not line:
                continue

            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                _send(_rpc_error(None, ERR_PARSE, "Parse error"))
                continue

            if not isinstance(msg, dict):
                _send(_rpc_error(None, ERR_INVALID_PARAMS, "Invalid request"))
                continue

            method = msg.get("method")
            msg_id = msg.get("id")

            if method == "initialize":
                _send(
                    _rpc_result(
                        msg_id,
                        {
                            "protocolVersion": PROTOCOL_VERSION,
                            "capabilities": {"tools": {}},
                            "serverInfo": {
                                "name": SERVER_NAME,
                                "version": SERVER_VERSION,
                            },
                        },
                    )
                )
            elif method == "initialized":
                # Notification: acknowledged silently, no response.
                continue
            elif method == "tools/list":
                _send(_rpc_result(msg_id, {"tools": _tool_list()}))
            elif method == "tools/call":
                params = msg.get("params") or {}
                if not isinstance(params, dict):
                    _send(
                        _rpc_error(
                            msg_id, ERR_INVALID_PARAMS, "params must be an object"
                        )
                    )
                    continue
                name = params.get("name")
                arguments = params.get("arguments") or {}
                kind, payload = _call_tool(name, arguments, client, base_url, token)
                if kind == "rpc_error":
                    _send(payload)
                else:
                    _send(
                        _rpc_result(
                            msg_id,
                            {
                                "content": [
                                    {"type": "text", "text": json.dumps(payload)}
                                ]
                            },
                        )
                    )
            else:
                _send(
                    _rpc_error(
                        msg_id,
                        ERR_METHOD_NOT_FOUND,
                        f"method {method!r} not found",
                    )
                )
    finally:
        client.close()


if __name__ == "__main__":
    main()
