# Master Control MCP tools → /api/fleet routes

Snapshot of the pre-deletion `cli` MCP server (`cli/src/tools.rs` at `d328594^`,
removed in D3). Each tool lists its arguments and the `/api/fleet` route that
serves it. Tools with no `/api/fleet` route yet are marked "no route yet".

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

### mc_list_devices

List all devices known to MeshCentral: id, name, group, connection state
(0=offline, 1=online, 2=connected), platform, IP.

**Arguments:** device_id (required)

**Route:** GET /api/fleet/meshcentral/list_devices

### mc_fleet_stats

Aggregate fleet stats: server count, MeshCentral online/offline counts, device
types.

**Arguments:** none

**Route:** GET /api/fleet/meshcentral/get_fleet_stats

### mc_sync_fleet

Sync MeshCentral device inventory into servers.json. Matches devices by
hostname/IP, enrolls new ones. Returns counts of found/matched/new/updated.

**Arguments:** none

**Route:** POST /api/fleet/meshcentral/sync_fleet

## Device operations

### mc_device_status

Get live status of a MeshCentral device: connected, CPU usage, memory usage,
uptime, data source.

**Arguments:** device_id (required)

**Route:** GET /api/fleet/meshcentral/get_device_status

### mc_shell_exec

Execute a shell command on a server via MeshCentral. Returns stdout/stderr and
exit code. server_id is the short id from mc_list_servers.

**Arguments:** server_id (required), command (required), timeout_secs? (default 30)

**Route:** POST /api/fleet/meshcentral/shell_exec

### mc_shell_fleet

Execute the same shell command on several servers in parallel via MeshCentral.
Returns per-server results.

**Arguments:** server_ids (required), command (required), timeout_secs? (default 30)

**Route:** no route yet — runs a command on multiple servers; the nearest route
POST /api/fleet/meshcentral/execute_batch runs commands on MeshCentral devices
of a single server, not multiple servers.

### mc_system_stats

Get detailed system stats for a server (Unraid): CPU, memory, disks, network,
uptime. Runs locally via GraphQL, not SSH.

**Arguments:** server_id (required)

**Route:** GET /api/fleet/system/stats

## Power (MeshCentral PRIMARY — never SSH for reboot/shutdown)

### mc_reboot

Reboot a server via MeshCentral. This is the PRIMARY reboot method — do not use
SSH.

**Arguments:** server_id (required)

**Route:** no route yet — power operations stay on MeshCentral; not ported to /api/fleet

### mc_shutdown

Shutdown a server via MeshCentral. This is the PRIMARY shutdown method — do not
use SSH.

**Arguments:** server_id (required)

**Route:** no route yet — power operations stay on MeshCentral; not ported to /api/fleet

## Docker

### mc_docker_containers

List Docker containers on a server via MeshCentral: name, image, state, status.

**Arguments:** server_id (required)

**Route:** GET /api/fleet/unraid/get_docker_containers

### mc_docker_start

Start a Docker container on a server via MeshCentral.

**Arguments:** server_id (required), container (required)

**Route:** POST /api/fleet/docker/start

### mc_docker_stop

Stop a Docker container on a server via MeshCentral.

**Arguments:** server_id (required), container (required)

**Route:** POST /api/fleet/docker/stop

### mc_docker_restart

Restart a Docker container on a server via MeshCentral.

**Arguments:** server_id (required), container (required)

**Route:** POST /api/fleet/docker/restart

## Alerts

### mc_alert_list

List alerts from the local alert store. Optional filters: severity
(critical|warning|info), device_id, acknowledged (true/false).

**Arguments:** severity?, device_id?, acknowledged?

**Route:** GET /api/fleet/alerts/list

### mc_alert_get

Get a single alert by id.

**Arguments:** id (required)

**Route:** GET /api/fleet/alerts/get

### mc_alert_create

Create a new alert. severity: critical|warning|info. source identifies the
producer (e.g. "manual", "meshcentral", "prometheus").

**Arguments:** severity (required), title (required), message (required),
source (required), device_id?, auto_ack_rule?

**Route:** POST /api/fleet/alerts/create

### mc_alert_acknowledge

Acknowledge a single alert by id.

**Arguments:** id (required), acknowledged_by (required)

**Route:** POST /api/fleet/alerts/acknowledge

### mc_alert_acknowledge_all

Acknowledge all alerts matching optional filters (severity, device_id). Returns
count acknowledged.

**Arguments:** acknowledged_by (required), severity?, device_id?

**Route:** POST /api/fleet/alerts/acknowledge_all

### mc_alert_auto_ack

Run the auto-acknowledgment rules (auto-ack info alerts older than 1 hour).
Returns count auto-acknowledged.

**Arguments:** none

**Route:** POST /api/fleet/alerts/auto_ack_run

## Prometheus / Monitoring

### mc_prometheus_health

Check if a Prometheus server is reachable and ready. Returns true/false.

**Arguments:** base_url (required)

**Route:** no route yet — queries an external Prometheus base_url; not a fleet route

### mc_prometheus_query

Run a PromQL range query. start/end are RFC3339 or unix timestamps; step is a
duration string (e.g. "1m", "15s").

**Arguments:** base_url (required), query (required), start (required), end
(required), step (required)

**Route:** no route yet — queries an external Prometheus base_url; not a fleet route

## Services

### mc_adguard_status

Get AdGuard Home DNS protection status for a server.

**Arguments:** server_id (required)

**Route:** GET /api/fleet/adguard/status

### mc_adguard_enable

Enable AdGuard DNS protection on a server.

**Arguments:** server_id (required)

**Route:** POST /api/fleet/adguard/enable

### mc_adguard_disable

Disable AdGuard DNS protection on a server.

**Arguments:** server_id (required)

**Route:** POST /api/fleet/adguard/disable

### mc_tailscale_peers

List Tailscale peers on a server (via SSH tailscale status).

**Arguments:** server_id (required)

**Route:** no route yet — runs tailscale status over SSH; not ported to /api/fleet

### mc_array_info

Get Unraid array status: drives, health, capacity, parity.

**Arguments:** server_id (required)

**Route:** GET /api/fleet/unraid/get_array_info

### mc_test_connection

Test SSH and service connectivity to a server. Takes a full server config object
(from mc_list_servers).

**Arguments:** config (required)

**Route:** POST /api/fleet/test_connection

## Tool count

28 tools total: 22 with a /api/fleet route, 6 marked "no route yet"
(mc_shell_fleet, mc_reboot, mc_shutdown, mc_prometheus_health,
mc_prometheus_query, mc_tailscale_peers).
