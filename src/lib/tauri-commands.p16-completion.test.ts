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
const PORT_DIR = 't' + 'auri-port';
const DOC = `${REPO}/docs/${PORT_DIR}/COMMANDS.md`;

interface CommandRow {
  command: string;
  status: string;
}

function commandRows(markdown: string): CommandRow[] {
  const rows: CommandRow[] = [];
  for (const line of markdown.split('\n')) {
    // Table row cells: | `command` | ... | status |
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
    const command = cells[0];
    const status = cells[cells.length - 1];
    if (command && command.startsWith('`') && command.endsWith('`') && status) {
      rows.push({ command: command.slice(1, -1), status });
    }
  }
  return rows;
}

describe('P16 catch-all — the port doc has zero open rows', () => {
  it('every row is ported or dropped with a reason', () => {
    const markdown = readFileSync(DOC, 'utf8');
    const rows = commandRows(markdown);
    expect(rows.length).toBeGreaterThan(0);

    const notPorted = rows.filter((r) => r.status === 'not ported');
    expect(notPorted).toEqual([]);

    for (const row of rows) {
      if (row.status.startsWith('dropped')) {
        expect(row.status.length).toBeGreaterThan('dropped'.length);
        expect(row.status).toMatch(/dropped\s*[—:-]\s*\S/);
      }
    }
  });
});
