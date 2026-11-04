import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { readFileSync } from 'fs';

const REPO = process.cwd();

describe('D3: src-tauri and Tauri tooling removed', () => {
  it('src-tauri/ no longer exists', () => {
    expect(existsSync(`${REPO}/src-tauri`)).toBe(false);
  });

  it('cli/ no longer exists (it depended on src-tauri)', () => {
    expect(existsSync(`${REPO}/cli`)).toBe(false);
  });

  it('package.json has no @tauri-apps dependencies', () => {
    const pkg = JSON.parse(readFileSync(`${REPO}/package.json`, 'utf8'));
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    expect(Object.keys(deps).filter((d) => d.startsWith('@tauri-apps/'))).toEqual([]);
  });

  it('package.json has no "tauri" script', () => {
    const pkg = JSON.parse(readFileSync(`${REPO}/package.json`, 'utf8'));
    expect(pkg.scripts).not.toHaveProperty('tauri');
  });
});
