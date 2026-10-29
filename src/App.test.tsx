import { describe, it, expect } from 'vitest';
import { SIDEBAR_ITEMS, NAV_ITEMS } from './config/nav';

describe('Navigation (S5)', () => {
  it('sidebar shows only Ticketing and Settings', () => {
    expect(SIDEBAR_ITEMS.map((i) => i.id)).toEqual(['ticketing', 'settings']);
  });

  it('other routes exist in code but are unlinked from the sidebar', () => {
    const unlinked = NAV_ITEMS.filter((i) => !i.sidebar).map((i) => i.id);
    expect(unlinked).toContain('dashboard');
    expect(unlinked).toContain('meshcentral');
    expect(unlinked).toContain('chat');
  });
});
