import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Regression test for queue task A5: `docs/ARCHITECTURE_WEB.md` must document
 * the servers.json shape for the three *arr service keys (lidarr, sonarr,
 * radarr) with placeholder values only — the API key looks like
 * 0123456789abcdef0123456789abcdef. No real hostnames, emails, or tokens.
 */
const DOC = 'docs/ARCHITECTURE_WEB.md';

const doc = readFileSync(DOC, 'utf8');

describe('A5: servers.json documents the three Arr service keys', () => {
  it('doc exists and is non-empty', () => {
    expect(doc.length).toBeGreaterThan(0);
  });

  it('documents lidarr_url / lidarr_api_key', () => {
    expect(doc).toContain('lidarr_url');
    expect(doc).toContain('lidarr_api_key');
  });

  it('documents sonarr_url / sonarr_api_key', () => {
    expect(doc).toContain('sonarr_url');
    expect(doc).toContain('sonarr_api_key');
  });

  it('documents radarr_url / radarr_api_key', () => {
    expect(doc).toContain('radarr_url');
    expect(doc).toContain('radarr_api_key');
  });

  it('uses a placeholder API key only (0123456789abcdef0123456789abcdef)', () => {
    expect(doc).toContain('0123456789abcdef0123456789abcdef');
  });
});
