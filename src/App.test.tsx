import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SIDEBAR_GROUPS, NAV_ITEMS } from './config/nav';
import { render, screen, fireEvent } from '@testing-library/react';
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

// Mock fleet-api so hooks don't throw in jsdom
vi.mock('../lib/fleet-api', () => ({
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
  it('sidebar exposes the full navigation set, not just Ticketing and Settings', () => {
    const ids = SIDEBAR_GROUPS.flatMap((group) => group.pages.map((page) => page.id));
    for (const id of [
      'ticketing',
      'settings',
      'docker',
      'storage',
      'system',
      'network',
      'arr',
      'homeassistant',
      'nextcloud',
      'adguard',
      'chat',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('other routes exist in code but are unlinked from the sidebar', () => {
    const unlinked = NAV_ITEMS.filter((i) => !i.sidebar).map((i) => i.id);
    expect(unlinked).toContain('dashboard');
    expect(unlinked).toContain('meshcentral');
    expect(unlinked).toContain('fleet-command');
    expect(unlinked).toContain('compliance');
    expect(unlinked).toContain('alerts');
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

describe('Mobile drawer overlay (D-2 / SIDEBAR-001)', () => {
  beforeEach(() => {
    // Force a mobile viewport so the sidebar renders as the full-width
    // overlay drawer instead of the desktop rail.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        media: '(max-width: 860px)',
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('renders the sidebar as a closed full-width drawer on mobile', () => {
    const { container } = render(<App />);
    const sidebar = container.querySelector('aside');
    expect(sidebar).not.toBeNull();
    expect(sidebar).toHaveClass('w-full');
    expect(sidebar).toHaveClass('-translate-x-full');
    expect(sidebar).not.toHaveClass('translate-x-0');
    // No backdrop overlay while the drawer is closed.
    expect(container.querySelector('div.fixed.inset-0[aria-hidden="true"]')).toBeNull();
  });

  it('opens the drawer overlay when the menu button is clicked', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    const sidebar = container.querySelector('aside');
    expect(sidebar).toHaveClass('translate-x-0');
    expect(sidebar).not.toHaveClass('-translate-x-full');
    // Backdrop overlay is present while the drawer is open.
    expect(container.querySelector('div.fixed.inset-0[aria-hidden="true"]')).not.toBeNull();
  });

  it('closes the drawer on Escape', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    expect(container.querySelector('aside')).toHaveClass('translate-x-0');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('aside')).toHaveClass('-translate-x-full');
    expect(container.querySelector('div.fixed.inset-0[aria-hidden="true"]')).toBeNull();
  });
});
