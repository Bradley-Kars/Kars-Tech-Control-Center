import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Regression test for queue task M4: `docs/mcp/README.md` must document how to
 * register the Master Control stdio MCP server (backend/mcp/server.py) in an
 * opencode or Claude MCP config (placeholders only), and how to create the API
 * token. No real hostnames, emails, or tokens.
 */
const DOC = 'docs/mcp/README.md';

const doc = readFileSync(DOC, 'utf8');

describe('M4: MCP server README documents registration and token creation', () => {
  it('doc exists and is non-empty', () => {
    expect(doc.length).toBeGreaterThan(0);
  });

  it('documents opencode MCP config registration (placeholders only)', () => {
    expect(doc).toContain('opencode');
    expect(doc).toContain('backend/mcp/server.py');
    expect(doc).toContain('KTS_API_URL');
    expect(doc).toContain('KTS_API_TOKEN');
    expect(doc).toContain('<');
  });

  it('documents Claude MCP config registration (mcpServers, placeholders only)', () => {
    expect(doc).toContain('claude');
    expect(doc).toContain('mcpServers');
    expect(doc).toContain('command');
    expect(doc).toContain('args');
    expect(doc).toContain('env');
  });

  it('documents how to create the API token', () => {
    expect(doc).toContain('token');
    expect(doc).toContain('KTS_API_TOKEN');
  });

  it('uses placeholders only — no real hostnames, emails, or tokens', () => {
    expect(doc).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(doc).not.toContain('192.168.4.');
    expect(doc).not.toContain('tailf6d3b4');
    expect(doc).not.toContain('slayerbrk');
    expect(doc).not.toContain('owner@example.com');
  });
});
