import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';

// Ambient declarations so the test can read repo files under vitest (Node) and
// still satisfy `tsc -b` (bundler resolution, no node types in tsconfig.app).
declare module 'fs' {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: string): string;
  export function readdirSync(path: string): string[];
}

// Resolve the repo root from this test file's module URL so no
// machine-specific path is hardcoded in the repository. Pure string ops keep
// `tsc -b` happy without augmenting Node built-in modules.
const filePath = import.meta.url.replace(/^file:\/\//, '');
const REPO = filePath.split('/').slice(0, -3).join('/');
const SRC = `${REPO}/src`;

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = `${dir}/${name}`;
    if (statSync(full).isDirectory()) {
      collectFiles(full, out);
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

// Matches relative imports of the removed tauri-commands module
const TAURI_COMMANDS_IMPORT = /from\s+['"](?:\.\.\/)*(?:\.\.\/)*lib\/tauri-commands['"]/;

describe('D2: src/lib/tauri-commands.ts removed', () => {
  it('src/lib/tauri-commands.ts does not exist', () => {
    expect(existsSync(`${SRC}/lib/tauri-commands.ts`)).toBe(false);
  });

  it('no source file imports from tauri-commands.ts', () => {
    const files = collectFiles(SRC);
    let checked = 0;
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      if (TAURI_COMMANDS_IMPORT.test(content)) {
        checked++;
      }
    }
    expect(checked).toBe(0);
  });

  it('fleet-api.ts exists and exports the ported fleet functions', () => {
    const content = readFileSync(`${SRC}/lib/fleet-api.ts`, 'utf8');
    expect(content.length).toBeGreaterThan(0);
    for (const fn of [
      'getServers',
      'saveServer',
      'removeServer',
      'testConnection',
      'getSystemStats',
      'getDockerContainers',
      'alertList',
      'meshcentralShellExec',
      'metricCollectAll',
    ]) {
      expect(content).toContain(`export async function ${fn}`);
    }
  });
});
