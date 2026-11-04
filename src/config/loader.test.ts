import { describe, it, expect } from 'vitest';

describe('config loader', () => {
  it('module loads', async () => {
    const mod = await import('./loader');
    expect(mod).toBeDefined();
  });
});
