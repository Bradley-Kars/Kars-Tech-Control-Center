# Master Control MCP tools → /api/fleet routes

Snapshot of the pre-deletion `cli` MCP server (`cli/src/tools.rs` at `d328594^`,
removed in D3). Each tool lists its arguments, its `/api/fleet` route, the
instructions text copied from the tool contract, and the input schema copied
from the tool contract. Tools with no `/api/fleet` route yet are marked "no route yet".

The contract source `~/kts-private/mcp-contract.jsonl` is not present on disk;
this doc is built from the same canonical contract M1 used,
`cli/src/tools.rs` at `d328594^` (the `tool_definitions()` function), via
`git show d328594^:cli/src/tools.rs`. All hostnames and device names have been
replaced with placeholders (e.g. `<server-id>`, `<who>`).

Tool arguments marked `?` are optional. Every route is identity-enforced by
`create_app` middleware (401 without a token; scope=write for POST/DELETE) and
responses never include secret fields.

## Fleet overview

### mc_list_servers

List every configured server with id, name, hostname, device_type, and
MeshCentral status (online/offline). Use the `id` field as server_id for other
tools.

**Arguments:** none

**Route:** GET /api/fleet/servers

**Instructions:** List every configured server with id, name, hostname, device_type, and MeshCentral status (online/offline). Use the `id` field as server_id for other tools.

**Schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

### mc_list_devices

List all devices known to MeshCentral: id, name, group, connection state
(0=offline, 1=online, 2=connected), platform, IP.

**Arguments:** device_id (required)

**Route:** GET /api/fleet/meshcentral/list_devices

**Instructions:** List all devices known to MeshCentral: id, name, group, connection state (0=offline, 1=online, 2=connected), platform, IP.

**Schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

### mc_fleet_stats

Aggregate fleet stats: server count, MeshCentral online/offline counts, device
types.

**Arguments:** none

**Route:** GET /api/fleet/meshcentral/get_fleet_stats

**Instructions:** Aggregate fleet stats: server count, MeshCentral online/offline counts, device types.

**Schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

### mc_sync_fleet

Sync MeshCentral device inventory into servers.json. Matches devices by
hostname/IP, enrolls new ones. Returns counts of found/matched/new/updated.

**Arguments:** none

**Route:** POST /api/fleet/meshcentral/sync_fleet

**Instructions:** Sync MeshCentral device inventory into servers.json. Matches devices by hostname/IP, enrolls new ones. Returns counts of found/matched/new/updated.

**Schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

## Device operations

### mc_device_status

Get live status of a MeshCentral device: connected, CPU usage, memory usage,
uptime, data source.

**Arguments:** device_id (required)

**Route:** GET /api/fleet/meshcentral/get_device_status

**Instructions:** Get live status of a MeshCentral device: connected, CPU usage, memory usage, uptime, data source.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "device_id": {
      "type": "string",
      "description": "MeshCentral device id (from mc_list_devices or servers.json meshcentral_device_id)"
    }
  },
  "required": ["device_id"]
}
```

### mc_shell_exec

Execute a shell command on a server via MeshCentral. Returns stdout/stderr and
exit code. server_id is the short id from mc_list_servers.

**Arguments:** server_id (required), command (required), timeout_secs? (default 30)

**Route:** POST /api/fleet/meshcentral/shell_exec

**Instructions:** Execute a shell command on a server via MeshCentral. Returns stdout/stderr and exit code. server_id is the short id from mc_list_servers.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "server_id": {
      "type": "string",
      "description": "Server id (e.g. \"<server-id>\")"
    },
    "command": {
      "type": "string",
      "description": "Shell command to execute"
    },
    "timeout_secs": {
      "type": "integer",
      "description": "Timeout in seconds (default 30)"
    }
  },
  "required": ["server_id", "command"]
}
```

### mc_shell_fleet

Execute the same shell command on several servers in parallel via MeshCentral.
Returns per-server results.

**Arguments:** server_ids (required), command (required), timeout_secs? (default 30)

**Route:** no route yet — runs a command on multiple servers; the nearest route
POST /api/fleet/meshcentral/execute_batch runs commands on MeshCentral devices
of a single server, not multiple servers.

**Instructions:** Execute the same shell command on several servers in parallel via MeshCentral. Returns per-server results.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "server_ids": {
      "type": "array",
      "items": {
        "type": "string",
        "description": "Server id"
      },
      "description": "List of server ids"
    },
    "command": {
      "type": "string",
      "description": "Shell command"
    },
    "timeout_secs": {
      "type": "integer",
      "description": "Timeout in seconds (default 30)"
    }
  },
  "required": ["server_ids", "command"]
}
```

### mc_system_stats

Get detailed system stats for a server (Unraid): CPU, memory, disks, network,
uptime. Runs locally via GraphQL, not SSH.

**Arguments:** server_id (required)

**Route:** GET /api/fleet/system/stats

**Instructions:** Get detailed system stats for a server (Unraid): CPU, memory, disks, network, uptime. Runs locally via GraphQL, not SSH.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "server_id": {
      "type": "string",
      "description": "Server id"
    }
  },
  "required": ["server_id"]
}
```

## Power (MeshCentral PRIMARY — never SSH for reboot/shutdown)

### mc_reboot

Reboot a server via MeshCentral. This is the PRIMARY reboot method — do not use
SSH.

**Arguments:** server_id (required)

**Route:** no route yet — power operations stay on MeshCentral; not ported to /api/fleet

**Instructions:** Reboot a server via MeshCentral. This is the PRIMARY reboot method — do not use SSH.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "server_id": {
      "type": "string",
      "description": "Server id to reboot"
    }
  },
  "required": ["server_id"]
}
```

### mc_shutdown

Shutdown a server via MeshCentral. This is the PRIMARY shutdown method — do not
use SSH.

**Arguments:** server_id (required)

**Route:** no route yet — power operations stay on MeshCentral; not ported to /api/fleet

**Instructions:** Shutdown a server via MeshCentral. This is the PRIMARY shutdown method — do not use SSH.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "server_id": {
      "type": "string",
      "description": "Server id to shutdown"
    }
  },
  "required": ["server_id"]
}
```

## Docker

### mc_docker_containers

List Docker containers on a server via MeshCentral: name, image, state, status.

**Arguments:** server_id (required)

**Route:** GET /api/fleet/unraid/get_docker_containers

**Instructions:** List Docker containers on a server via MeshCentral: name, image, state, status.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "server_id": {
      "type": "string",
      "description": "Server id"
    }
  },
  "required": ["server_id"]
}
```

### mc_docker_start

Start a Docker container on a server via MeshCentral.

**Arguments:** server_id (required), container (required)

**Route:** POST /api/fleet/docker/start

**Instructions:** Start a Docker container on a server via MeshCentral.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "server_id": {
      "type": "string",
      "description": "Server id"
    },
    "container": {
      "type": "string",
      "description": "Container name or id"
    }
  },
  "required": ["server_id", "container"]
}
```

### mc_docker_stop

Stop a Docker container on a server via MeshCentral.

**Arguments:** server_id (required), container (required)

**Route:** POST /api/fleet/docker/stop

**Instructions:** Stop a Docker container on a server via MeshCentral.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "server_id": {
      "type": "string",
      "description": "Server id"
    },
    "container": {
      "type": "string",
      "description": "Container name or id"
    }
  },
  "required": ["server_id", "container"]
}
```

### mc_docker_restart

Restart a Docker container on a server via MeshCentral.

**Arguments:** server_id (required), container (required)

**Route:** POST /api/fleet/docker/restart

**Instructions:** Restart a Docker container on a server via MeshCentral.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "server_id": {
      "type": "string",
      "description": "Server id"
    },
    "container": {
      "type": "string",
      "description": "Container name or id"
    }
  },
  "required": ["server_id", "container"]
}
```

## Alerts

### mc_alert_list

List alerts from the local alert store. Optional filters: severity
(critical|warning|info), device_id, acknowledged (true/false).

**Arguments:** severity?, device_id?, acknowledged?

**Route:** GET /api/fleet/alerts/list

**Instructions:** List alerts from the local alert store. Optional filters: severity (critical|warning|info), device_id, acknowledged (true/false).

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "severity": {
      "type": "string",
      "description": "Filter: critical, warning, or info"
    },
    "device_id": {
      "type": "string",
      "description": "Filter by device id"
    },
    "acknowledged": {
      "type": "boolean",
      "description": "Filter by acknowledged state"
    }
  }
}
```

### mc_alert_get

Get a single alert by id.

**Arguments:** id (required)

**Route:** GET /api/fleet/alerts/get

**Instructions:** Get a single alert by id.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "integer",
      "description": "Alert id"
    }
  },
  "required": ["id"]
}
```

### mc_alert_create

Create a new alert. severity: critical|warning|info. source identifies the
producer (e.g. "manual", "meshcentral", "prometheus").

**Arguments:** severity (required), title (required), message (required),
source (required), device_id?, auto_ack_rule?

**Route:** POST /api/fleet/alerts/create

**Instructions:** Create a new alert. severity: critical|warning|info. source identifies the producer (e.g. "manual", "meshcentral", "prometheus").

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "severity": {
      "type": "string",
      "description": "critical, warning, or info"
    },
    "title": {
      "type": "string",
      "description": "Alert title"
    },
    "message": {
      "type": "string",
      "description": "Alert message"
    },
    "device_id": {
      "type": "string",
      "description": "Optional device id"
    },
    "source": {
      "type": "string",
      "description": "Alert source (e.g. \"manual\")"
    },
    "auto_ack_rule": {
      "type": "string",
      "description": "Optional JSON auto-ack rule"
    }
  },
  "required": ["severity", "title", "message", "source"]
}
```

### mc_alert_acknowledge

Acknowledge a single alert by id.

**Arguments:** id (required), acknowledged_by (required)

**Route:** POST /api/fleet/alerts/acknowledge

**Instructions:** Acknowledge a single alert by id.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "integer",
      "description": "Alert id"
    },
    "acknowledged_by": {
      "type": "string",
      "description": "Who acknowledged (e.g. \"<who>\")"
    }
  },
  "required": ["id", "acknowledged_by"]
}
```

### mc_alert_acknowledge_all

Acknowledge all alerts matching optional filters (severity, device_id). Returns
count acknowledged.

**Arguments:** acknowledged_by (required), severity?, device_id?

**Route:** POST /api/fleet/alerts/acknowledge_all

**Instructions:** Acknowledge all alerts matching optional filters (severity, device_id). Returns count acknowledged.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "severity": {
      "type": "string",
      "description": "Filter: critical, warning, or info"
    },
    "device_id": {
      "type": "string",
      "description": "Filter by device id"
    },
    "acknowledged_by": {
      "type": "string",
      "description": "Who acknowledged"
    }
  },
  "required": ["acknowledged_by"]
}
```

### mc_alert_auto_ack

Run the auto-acknowledgment rules (auto-ack info alerts older than 1 hour).
Returns count auto-acknowledged.

**Arguments:** none

**Route:** POST /api/fleet/alerts/auto_ack_run

**Instructions:** Run the auto-acknowledgment rules (auto-ack info alerts older than 1 hour). Returns count auto-acknowledged.

**Schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

## Prometheus / Monitoring

### mc_prometheus_health

Check if a Prometheus server is reachable and ready. Returns true/false.

**Arguments:** base_url (required)

**Route:** no route yet — queries an external Prometheus base_url; not a fleet route

**Instructions:** Check if a Prometheus server is reachable and ready. Returns true/false.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "base_url": {
      "type": "string",
      "description": "Prometheus base URL"
    }
  },
  "required": ["base_url"]
}
```

### mc_prometheus_query

Run a PromQL range query. start/end are RFC3339 or unix timestamps; step is a
duration string (e.g. "1m").

**Arguments:** base_url (required), query (required), start (required), end
(required), step (required)

**Route:** no route yet — queries an external Prometheus base_url; not a fleet route

**Instructions:** Run a PromQL range query. start/end are RFC3339 or unix timestamps; step is a duration string (e.g. "1m").

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "base_url": {
      "type": "string",
      "description": "Prometheus base URL"
    },
    "query": {
      "type": "string",
      "description": "PromQL query"
    },
    "start": {
      "type": "string",
      "description": "Start time (RFC3339 or unix seconds)"
    },
    "end": {
      "type": "string",
      "description": "End time"
    },
    "step": {
      "type": "string",
      "description": "Step duration (e.g. \"1m\", \"15s\")"
    }
  },
  "required": ["base_url", "query", "start", "end", "step"]
}
```

## Services

### mc_adguard_status

Get AdGuard Home DNS protection status for a server.

**Arguments:** server_id (required)

**Route:** GET /api/fleet/adguard/status

**Instructions:** Get AdGuard Home DNS protection status for a server.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "server_id": {
      "type": "string",
      "description": "Server id"
    }
  },
  "required": ["server_id"]
}
```

### mc_adguard_enable

Enable AdGuard DNS protection on a server.

**Arguments:** server_id (required)

**Route:** POST /api/fleet/adguard/enable

**Instructions:** Enable AdGuard DNS protection on a server.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "server_id": {
      "type": "string",
      "description": "Server id"
    }
  },
  "required": ["server_id"]
}
```

### mc_adguard_disable

Disable AdGuard DNS protection on a server.

**Arguments:** server_id (required)

**Route:** POST /api/fleet/adguard/disable

**Instructions:** Disable AdGuard DNS protection on a server.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "server_id": {
      "type": "string",
      "description": "Server id"
    }
  },
  "required": ["server_id"]
}
```

### mc_tailscale_peers

List Tailscale peers on a server (via SSH tailscale status).

**Arguments:** server_id (required)

**Route:** no route yet — runs tailscale status over SSH; not ported to /api/fleet

**Instructions:** List Tailscale peers on a server (via SSH tailscale status).

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "server_id": {
      "type": "string",
      "description": "Server id"
    }
  },
  "required": ["server_id"]
}
```

### mc_array_info

Get Unraid array status: drives, health, capacity, parity.

**Arguments:** server_id (required)

**Route:** GET /api/fleet/unraid/get_array_info

**Instructions:** Get Unraid array status: drives, health, capacity, parity.

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "server_id": {
      "type": "string",
      "description": "Server id"
    }
  },
  "required": ["server_id"]
}
```

### mc_test_connection

Test SSH and service connectivity to a server. Takes a full server config object
(from mc_list_servers).

**Arguments:** config (required)

**Route:** POST /api/fleet/test_connection

**Instructions:** Test SSH and service connectivity to a server. Takes a full server config object (from mc_list_servers).

**Schema:**

```json
{
  "type": "object",
  "properties": {
    "config": {
      "type": "object",
      "description": "ServerConfig object (from mc_list_servers)"
    }
  },
  "required": ["config"]
}
```

## Tool count

28 tools total: 22 with a /api/fleet route, 6 marked "no route yet"
(mc_shell_fleet, mc_reboot, mc_shutdown, mc_prometheus_health,
mc_prometheus_query, mc_tailscale_peers).

## Transport rule

MeshCentral is the PRIMARY transport for reboot, shutdown, and shell — never
raw SSH for power operations. mc_reboot and mc_shutdown have no /api/fleet route
and stay on MeshCentral. mc_shell_exec and mc_shell_fleet run via MeshCentral;
mc_tailscale_peers runs `tailscale status` over SSH (read-only peer listing,
not a power operation).