import { describe, it, expect, vi } from 'vitest';
import { SIDEBAR_ITEMS, NAV_ITEMS } from './config/nav';
import { render, screen } from '@testing-library/react';
import App from './App';

// Mock localStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
});

// Mock tauri API so hooks don't throw in jsdom
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
  Channel: class {},
}));

// Mock tauri-commands so hooks don't throw in jsdom
vi.mock('../lib/tauri-commands', () => ({
  getServers: vi.fn().mockResolvedValue([]),
  saveServer: vi.fn().mockResolvedValue(undefined),
  removeServer: vi.fn().mockResolvedValue(undefined),
  getSystemStats: vi.fn().mockResolvedValue({}),
  getLocalSystemStats: vi.fn().mockResolvedValue({}),
  meshcentralGetFleetStats: vi.fn().mockResolvedValue({}),
  meshcentralGetSystemStats: vi.fn().mockResolvedValue({}),
  metricCollectAll: vi.fn().mockResolvedValue(undefined),
  pollAllAlertSources: vi.fn().mockResolvedValue({}),
}));

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

describe('Routing', () => {
  it('redirects index route "/" to "/ticketing"', async () => {
    render(<App />);
    // Allow async navigation to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.getByRole('heading', { name: 'Ticketing' })).toBeInTheDocument();
  });
});
