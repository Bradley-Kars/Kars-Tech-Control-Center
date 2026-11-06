import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from './CommandPalette';
import { AppProvider } from '../../context/AppContext';
import { SIDEBAR_GROUPS } from '../../config/nav';

// Mock localStorage so AppProvider's state initializer doesn't throw in jsdom
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
});

// jsdom does not implement scrollIntoView; the palette scrolls the
// selected result into view on mount, so stub it to avoid a crash.
Element.prototype.scrollIntoView = vi.fn();

type PaletteProps = Parameters<typeof CommandPalette>[0];

const servers = [
  { id: 's1', name: 'Unraid Server', device_type: 'unraid', hostname: 'unraid.tailnet.ts.net' },
  { id: 's2', name: 'Galaxy S24 Ultra', device_type: 'phone', hostname: 'phone.tailnet.ts.net' },
];

function renderPalette(overrides: Partial<PaletteProps> = {}) {
  const navigate = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <AppProvider>
      <CommandPalette
        isOpen
        onClose={onClose}
        navigate={navigate}
        servers={servers}
        location={{ pathname: '/ticketing' }}
        {...overrides}
      />
    </AppProvider>,
  );
  return { ...utils, navigate, onClose };
}

describe('Command palette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an enabled search input and opens as a dialog', () => {
    renderPalette();
    const input = screen.getByPlaceholderText('Type a command or search...');
    expect(input).toBeInTheDocument();
    expect(input).not.toBeDisabled();
    expect(screen.getByRole('dialog', { name: 'Command Palette' })).toBeInTheDocument();
  });

  it('lists every route from the sidebar', () => {
    renderPalette();
    const sidebarRoutes = SIDEBAR_GROUPS.flatMap((group) => group.pages);
    for (const page of sidebarRoutes) {
      // Each sidebar route is offered as a navigable command. Match on the
      // button's accessible name (which starts with the route label) so the
      // category kicker spans (e.g. 'System') don't collide.
      const name = new RegExp(`^${page.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('does not list MySpeed anywhere', () => {
    renderPalette();
    expect(screen.queryByText(/MySpeed/i)).not.toBeInTheDocument();
  });

  it('navigates to the selected route on Enter', async () => {
    const { navigate } = renderPalette();
    fireEvent.keyDown(window, { key: 'Enter' });
    // command actions are async; navigation lands on the next tick
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('navigates to a filtered route on Enter after searching', async () => {
    const { navigate } = renderPalette();
    const input = screen.getByPlaceholderText('Type a command or search...');
    fireEvent.change(input, { target: { value: 'ticketing' } });
    expect(
      screen.getByRole('button', { name: /^Ticketing/ }),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Enter' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(navigate).toHaveBeenCalledWith('/ticketing');
  });

  it('closes the palette on Escape', () => {
    const { onClose } = renderPalette();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
