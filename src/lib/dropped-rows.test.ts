import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Regression test for queue task C2: `docs/tauri-port/DROPPED.md` must group
 * every invoke command marked "dropped — host-local feature-flagged module (P14)"
 * in docs/tauri-port/COMMANDS.md (phone ADB, KDE Connect, Steam Deck / handheld —
 * 56 rows) by area, with a one-line reason each. None of them are implemented.
 * Placeholders only — no real hostnames, emails, or tokens.
 */
const COMMANDS = 'docs/tauri-port/COMMANDS.md';
const DROPPED = 'docs/tauri-port/DROPPED.md';

const commandsDoc = readFileSync(COMMANDS, 'utf8');

function droppedHostLocalCommands(doc: string): string[] {
  const out: string[] = [];
  for (const line of doc.split('\n')) {
    const m = line.match(/^\| `([^`]+)`/);
    if (!m) continue;
    if (line.includes('dropped') && line.includes('host-local feature-flagged module')) {
      out.push(m[1]);
    }
  }
  return out;
}

const droppedCommands = droppedHostLocalCommands(commandsDoc);

function droppedDoc(): string {
  return readFileSync(DROPPED, 'utf8');
}

describe('C2: docs/tauri-port/DROPPED.md groups every host-local dropped row', () => {
  it('finds 56 dropped host-local feature-flagged commands in COMMANDS.md', () => {
    expect(droppedCommands).toHaveLength(56);
  });

  it('DROPPED.md exists and is non-empty', () => {
    const dropped = droppedDoc();
    expect(dropped.length).toBeGreaterThan(0);
  });

  it('groups dropped rows by area: Phone, KDE Connect, Steam Deck / handheld', () => {
    const dropped = droppedDoc();
    expect(dropped).toContain('## Phone');
    expect(dropped).toContain('## KDE Connect');
    expect(dropped).toContain('## Steam Deck / handheld');
  });

  it.each(droppedCommands)('gives %s a one-line reason on its own line', (cmd) => {
    const dropped = droppedDoc();
    const line = dropped.split('\n').find(l => l.includes(`\`${cmd}\``));
    expect(line).toBeDefined();
    expect(line).toMatch(/ — /);
  });

  it('uses placeholders only — no real hostnames, emails, or tokens', () => {
    const dropped = droppedDoc();
    expect(dropped).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(dropped).not.toContain('192.168.4.');
    expect(dropped).not.toContain('tailf6d3b4');
    expect(dropped).not.toContain('slayerbrk');
    expect(dropped).not.toContain('KarsTechSolutions');
    expect(dropped).not.toContain('owner@example.com');
  });
});
