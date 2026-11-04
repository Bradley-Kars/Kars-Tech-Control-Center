import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Regression test for queue task R4: `bash backend/verify-gates.sh` must no
 * longer be referenced as a gate in CI, the README, or the architecture docs.
 * The backend gate is the pytest suite under `backend/tests/` (temp-dir
 * fixtures only — never the real vault or real ~/.ticketing).
 */
const CI = readFileSync('.github/workflows/ci.yml', { encoding: 'utf8' });
const README = readFileSync('README.md', { encoding: 'utf8' });
const ARCH = readFileSync('docs/ARCHITECTURE_WEB.md', { encoding: 'utf8' });

describe('R4: backend gates use pytest, not verify-gates.sh', () => {
  it('CI backend gates step runs pytest instead of verify-gates.sh', () => {
    expect(CI).not.toContain('verify-gates.sh');
    expect(CI).toContain('setup-python');
    expect(CI).toContain('pytest');
  });

  it('README full verification does not reference verify-gates.sh', () => {
    expect(README).not.toContain('verify-gates.sh');
  });

  it('architecture docs do not reference verify-gates.sh', () => {
    expect(ARCH).not.toContain('verify-gates.sh');
  });
});
