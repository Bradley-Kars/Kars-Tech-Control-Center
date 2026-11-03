import { describe, expect, it } from 'vitest';

// Ambient declaration so the test can read repo files under vitest (Node) and
// still satisfy `tsc -b` (bundler resolution, no node types in tsconfig.app).
declare module 'fs' {
  export function readFileSync(path: string, encoding: string): string;
}
import { readFileSync } from 'fs';

const REPO = '/home/slayerbrk/GitHub/Kars-Tech-Control-Center';
const SOURCE = `${REPO}/src/lib/tauri-commands.ts`;
const DOC = `${REPO}/docs/tauri-port/COMMANDS.md`;

function sourceCommands(source: string): string[] {
  const commands = new Set<string>();
  for (const m of source.matchAll(/invoke\('([a-zA-Z0-9_]+)'/g)) {
    commands.add(m[1]);
  }
  return [...commands].sort();
}

function docCommandCells(markdown: string): string[] {
  const cells: string[] = [];
  for (const line of markdown.split('\n')) {
    const m = line.match(/^\|\s*`([^`]+)`\s*\|/);
    if (m) cells.push(m[1]);
  }
  return cells;
}

describe('tauri-commands inventory — docs/tauri-port/COMMANDS.md', () => {
  it('exists with required columns and a row for every invoke command', () => {
    const source = readFileSync(SOURCE, 'utf8');
    const expected = sourceCommands(source);
    expect(expected.length).toBeGreaterThan(0);

    // RED while docs/tauri-port/COMMANDS.md does not exist.
    const markdown = readFileSync(DOC, 'utf8');

    for (const col of ['Command', 'Rust handler', 'UI files', 'Target route', 'Status']) {
      expect(markdown).toContain(`| ${col} |`);
    }

    const present = new Set(docCommandCells(markdown));
    for (const cmd of expected) {
      expect(present).toContain(cmd);
    }
  });
});
