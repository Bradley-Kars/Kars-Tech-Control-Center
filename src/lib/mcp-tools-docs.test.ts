import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Regression test for queue task M1: `docs/mcp/TOOLS.md` must snapshot every
 * pre-deletion cli MCP tool (cli/src/tools.rs at d328594^, removed in D3) with
 * its arguments and the /api/fleet route that serves it. Tools with no /api/fleet
 * route yet are marked "no route yet".
 *
 * The tool list is a snapshot of `tool_definitions()` in cli/src/tools.rs.
 */
const DOC = 'docs/mcp/TOOLS.md';

type McTool = {
  name: string;
  /** argument names, "?" suffix = optional */
  args: string[];
  /** /api/fleet route, or "no route yet" */
  route: string;
};

// Snapshot of cli/src/tools.rs tool_definitions() (pre-deletion, d328594^).
const TOOLS: McTool[] = [
  // Fleet overview
  { name: 'mc_list_servers', args: [], route: 'GET /api/fleet/servers' },
  { name: 'mc_list_devices', args: ['device_id'], route: 'GET /api/fleet/meshcentral/list_devices' },
  { name: 'mc_fleet_stats', args: [], route: 'GET /api/fleet/meshcentral/get_fleet_stats' },
  { name: 'mc_sync_fleet', args: [], route: 'POST /api/fleet/meshcentral/sync_fleet' },
  // Device operations
  { name: 'mc_device_status', args: ['device_id'], route: 'GET /api/fleet/meshcentral/get_device_status' },
  { name: 'mc_shell_exec', args: ['server_id', 'command', 'timeout_secs?'], route: 'POST /api/fleet/meshcentral/shell_exec' },
  { name: 'mc_shell_fleet', args: ['server_ids', 'command', 'timeout_secs?'], route: 'no route yet' },
  { name: 'mc_system_stats', args: ['server_id'], route: 'GET /api/fleet/system/stats' },
  // Power (MeshCentral PRIMARY — never SSH)
  { name: 'mc_reboot', args: ['server_id'], route: 'no route yet' },
  { name: 'mc_shutdown', args: ['server_id'], route: 'no route yet' },
  // Docker
  { name: 'mc_docker_containers', args: ['server_id'], route: 'GET /api/fleet/unraid/get_docker_containers' },
  { name: 'mc_docker_start', args: ['server_id', 'container'], route: 'POST /api/fleet/docker/start' },
  { name: 'mc_docker_stop', args: ['server_id', 'container'], route: 'POST /api/fleet/docker/stop' },
  { name: 'mc_docker_restart', args: ['server_id', 'container'], route: 'POST /api/fleet/docker/restart' },
  // Alerts
  { name: 'mc_alert_list', args: ['severity?', 'device_id?', 'acknowledged?'], route: 'GET /api/fleet/alerts/list' },
  { name: 'mc_alert_get', args: ['id'], route: 'GET /api/fleet/alerts/get' },
  { name: 'mc_alert_create', args: ['severity', 'title', 'message', 'source', 'device_id?', 'auto_ack_rule?'], route: 'POST /api/fleet/alerts/create' },
  { name: 'mc_alert_acknowledge', args: ['id', 'acknowledged_by'], route: 'POST /api/fleet/alerts/acknowledge' },
  { name: 'mc_alert_acknowledge_all', args: ['acknowledged_by', 'severity?', 'device_id?'], route: 'POST /api/fleet/alerts/acknowledge_all' },
  { name: 'mc_alert_auto_ack', args: [], route: 'POST /api/fleet/alerts/auto_ack_run' },
  // Prometheus / Monitoring (external Prometheus — no /api/fleet route)
  { name: 'mc_prometheus_health', args: ['base_url'], route: 'no route yet' },
  { name: 'mc_prometheus_query', args: ['base_url', 'query', 'start', 'end', 'step'], route: 'no route yet' },
  // Services
  { name: 'mc_adguard_status', args: ['server_id'], route: 'GET /api/fleet/adguard/status' },
  { name: 'mc_adguard_enable', args: ['server_id'], route: 'POST /api/fleet/adguard/enable' },
  { name: 'mc_adguard_disable', args: ['server_id'], route: 'POST /api/fleet/adguard/disable' },
  { name: 'mc_tailscale_peers', args: ['server_id'], route: 'no route yet' },
  { name: 'mc_array_info', args: ['server_id'], route: 'GET /api/fleet/unraid/get_array_info' },
  { name: 'mc_test_connection', args: ['config'], route: 'POST /api/fleet/test_connection' },
];

const doc = readFileSync(DOC, 'utf8');

describe('M1: MCP tools doc snapshots every cli tool', () => {
  it('doc exists and lists all 28 pre-deletion cli tools', () => {
    expect(doc.length).toBeGreaterThan(0);
    let found = 0;
    for (const t of TOOLS) {
      if (doc.includes(t.name)) found++;
    }
    expect(found).toBe(TOOLS.length);
  });

  it('every tool documents its arguments', () => {
    for (const t of TOOLS) {
      for (const arg of t.args) {
        expect(doc).toContain(arg);
      }
    }
  });

  it('every tool has a /api/fleet route or a "no route yet" marker after its name', () => {
    for (const t of TOOLS) {
      const idx = doc.indexOf(t.name);
      expect(idx).toBeGreaterThanOrEqual(0);
      const after = doc.slice(idx);
      if (t.route === 'no route yet') {
        expect(after).toContain('no route yet');
      } else {
        expect(after).toContain(t.route);
      }
    }
  });
});

describe('M1b: MCP tools doc includes instructions and schemas with placeholders', () => {
  it('every tool section has an Instructions paragraph copied from the contract', () => {
    for (const t of TOOLS) {
      const idx = doc.indexOf(`### ${t.name}`);
      expect(idx, `${t.name} section found`).toBeGreaterThanOrEqual(0);
      const end = doc.indexOf('\n### ', idx + 1);
      const section = end === -1 ? doc.slice(idx) : doc.slice(idx, end);
      expect(section, `${t.name} has an Instructions paragraph`).toContain(
        '**Instructions:**',
      );
    }
  });

  it('every tool section has a Schema code block with valid JSON', () => {
    for (const t of TOOLS) {
      const idx = doc.indexOf(`### ${t.name}`);
      expect(idx, `${t.name} section found`).toBeGreaterThanOrEqual(0);
      const end = doc.indexOf('\n### ', idx + 1);
      const section = end === -1 ? doc.slice(idx) : doc.slice(idx, end);
      expect(section, `${t.name} has a Schema block`).toContain('**Schema:**');
      const m = section.match(/```json\n([\s\S]*?)\n```/);
      expect(m, `${t.name} schema is a fenced JSON block`).toBeTruthy();
      expect(() => JSON.parse(m![1]), `${t.name} schema parses as JSON`).not.toThrow();
    }
  });

  it('no real hostnames or device names appear in instructions or schemas', () => {
    expect(doc).not.toContain('unraid-main');
    expect(doc).not.toContain('hermes');
  });
});
