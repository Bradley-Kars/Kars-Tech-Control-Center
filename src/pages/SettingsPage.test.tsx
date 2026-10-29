import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../context/AppContext';
import { SettingsPage } from './SettingsPage';

// jsdom in this vitest run does not expose localStorage; shim it for
// AppContext which reads kts:* keys.
const localStorageStore: Record<string, string> = {};
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v; },
    removeItem: (k: string) => { delete localStorageStore[k]; },
    clear: () => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]); },
  },
  writable: true,
});
// jsdom does not apply responsive CSS classes, so both desktop grid nav
// and mobile tab strip render. Tests therefore use getAllByRole where a
// button appears in both layouts.
vi.mock('../lib/tauri-commands', () => ({
  meshcentralSyncFleet: vi.fn().mockResolvedValue({
    devices_found: 2,
    devices_matched: 2,
    devices_new: 0,
    devices_updated: 0,
    errors: [],
  }),
  meshcentralGetFleetStats: vi.fn().mockResolvedValue({}),
}));

const wrap = (ui: React.ReactElement) => (
  <AppProvider>
    <MemoryRouter initialEntries={['/settings']}>{ui}</MemoryRouter>
  </AppProvider>
);

function firstBtn(name: string) {
  return screen.getAllByRole('button', { name })[0];
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders PageHeader title and left section nav', () => {
    render(wrap(<SettingsPage />));
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(firstBtn('Appearance')).toBeInTheDocument();
    expect(firstBtn('Notifications')).toBeInTheDocument();
    expect(firstBtn('Keyboard Shortcuts')).toBeInTheDocument();
    expect(firstBtn('MeshCentral')).toBeInTheDocument();
    expect(firstBtn('About')).toBeInTheDocument();
  });

  it('renders flat cards (no top accent bar) with section titles', () => {
    render(wrap(<SettingsPage />));
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText('Density')).toBeInTheDocument();
    expect(screen.getByText('Reduce motion')).toBeInTheDocument();
    // Switch to Notifications and verify its content renders
    fireEvent.click(firstBtn('Notifications'));
    expect(screen.getByText('Enable notifications')).toBeInTheDocument();
  });

  it('renders per-option descriptions without a duplicated group hint beside Theme/Density labels', () => {
    render(wrap(<SettingsPage />));
    // Options keep their descriptions
    expect(screen.getByText('Ink & teal — the KTS look')).toBeInTheDocument();
    expect(screen.getByText('Bright surfaces, same brand')).toBeInTheDocument();
    expect(screen.getByText('Comfortable')).toBeInTheDocument();
    expect(screen.getByText('Compact')).toBeInTheDocument();
    // The group labels render standalone (no duplicate hint text beside them)
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText('Density')).toBeInTheDocument();
  });

  it('applies 24px spacing (mt-6) between the Theme and Density groups', () => {
    render(wrap(<SettingsPage />));
    // Density RadioGroup carries the mt-6 (24px) top margin
    const densityLabel = screen.getByText('Density');
    const densityGroup = densityLabel.closest('fieldset');
    expect(densityGroup).toBeInTheDocument();
    expect(densityGroup).toHaveClass('mt-6');
  });

  it('switches sections via the left nav', () => {
    render(wrap(<SettingsPage />));
    fireEvent.click(firstBtn('MeshCentral'));
    expect(screen.getByText('Primary transport — fleet sync & live agent stats')).toBeInTheDocument();
  });
});
