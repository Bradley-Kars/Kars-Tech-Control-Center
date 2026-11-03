import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

// Ambient declaration so the test can read repo files under vitest (Node) and
// still satisfy `tsc -b` (bundler resolution, no node types in tsconfig.app).
declare module 'fs' {
  export function readFileSync(path: string, encoding: string): string;
}

// Resolve the repo root from this test file's module URL so no
// machine-specific path is hardcoded in the repository. Pure string ops keep
// `tsc -b` happy without augmenting Node built-in modules.
const filePath = import.meta.url.replace(/^file:\/\//, '');
const REPO = filePath.split('/').slice(0, -3).join('/');
const DOC = `${REPO}/docs/tauri-port/COMMANDS.md`;

// Split the doc into {name: content} sections by `## ` headers. The first part
// (before the first header) is the intro and is ignored.
function sections(markdown: string): Map<string, string> {
  const map = new Map<string, string>();
  const parts = markdown.split(/\n## /);
  for (const part of parts.slice(1)) {
    const nl = part.indexOf('\n');
    const name = nl === -1 ? part : part.slice(0, nl);
    const content = nl === -1 ? '' : part.slice(nl + 1);
    map.set(name, content);
  }
  return map;
}

function tableCells(markdown: string): string[] {
  const cells: string[] = [];
  for (const line of markdown.split('\n')) {
    const m = line.match(/^\|\s*`([^`]+)`\s*\|/);
    if (m) cells.push(m[1]);
  }
  return cells;
}

// Ticketing commands from src-tauri/src/services/ticketing.rs (read-only
// reference — NOT Tauri invoke commands; ticketing is a bridge API on port
// 8799, loopback only). Each must have a backend route, a TS api.ts function,
// and a COMMANDS.md row.
const TICKET_COMMANDS = [
  { command: 'fetch_overview', route: 'GET /api/tickets', ts: 'listTickets' },
  { command: 'create_ticket', route: 'POST /api/tickets', ts: 'createTicket' },
  { command: 'add_worklog', route: 'POST /api/tickets/{id}/worklog', ts: 'addWorklog' },
  { command: 'change_status', route: 'POST /api/tickets/{id}/status', ts: 'changeTicketStatus' },
  { command: 'compute_overview', route: 'n/a (pure card math)', ts: '—' },
  { command: 'invoice_for_ticket', route: 'n/a (invoice lookup)', ts: '—' },
  { command: 'load_fixture', route: 'n/a (mock fallback, MC-1)', ts: '—' },
];

describe('ticketing parity — docs/tauri-port/COMMANDS.md', () => {
  const sec = sections(readFileSync(DOC, 'utf8'));

  it('has a Ticketing section with required columns', () => {
    const ticketing = sec.get('Ticketing');
    expect(ticketing).not.toBeUndefined();
    for (const col of ['Command', 'Rust handler', 'UI files', 'Target route', 'Status']) {
      expect(ticketing).toContain(`| ${col} |`);
    }
  });

  it('has a row for every ticketing command from ticketing.rs', () => {
    const ticketing = sec.get('Ticketing');
    expect(ticketing).not.toBeUndefined();
    const present = new Set(tableCells(ticketing ?? ''));
    for (const { command } of TICKET_COMMANDS) {
      expect(present).toContain(command);
    }
  });

  it('maps each ticketing command to its backend route and TS function', () => {
    const ticketing = sec.get('Ticketing');
    expect(ticketing).not.toBeUndefined();
    for (const { route, ts } of TICKET_COMMANDS) {
      expect(ticketing).toContain(route);
      expect(ticketing).toContain(ts);
    }
  });

  it('documents that ticketing is a bridge API, not a Tauri invoke command', () => {
    const ticketing = sec.get('Ticketing');
    expect(ticketing).not.toBeUndefined();
    expect(ticketing).toContain('bridge API');
    expect(ticketing).toContain('8799');
    expect(ticketing).toContain('not part of the 172-command inventory');
  });
});
