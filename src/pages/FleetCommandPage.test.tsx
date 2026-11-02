import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from '../context/AppContext';
import { FleetCommandPage } from './FleetCommandPage';
import { useServers } from '../hooks';

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

vi.mock('../hooks', () => ({
  useServers: vi.fn(),
}));
vi.mock('../lib/tauri-commands', () => ({
  meshcentralShellFleet: vi.fn().mockResolvedValue([]),
}));

const mockUseServers = vi.mocked(useServers);

const wrap = () => (
  <AppProvider>
    <MemoryRouter initialEntries={['/fleet-command']}>
      <Routes>
        <Route path="fleet-command" element={<FleetCommandPage />} />
      </Routes>
    </MemoryRouter>
  </AppProvider>
);

const setServers = (servers: any[], loading = false, error: string | null = null) => {
  mockUseServers.mockReturnValue({ servers, loading, error });
};

describe('FleetCommandPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setServers([]);
  });

  it('empty state: shows empty state when no servers', async () => {
    setServers([]);
    render(wrap());
    await waitFor(() => expect(screen.getByText('Fleet Command')).toBeInTheDocument());
  });

  it('populated state: shows server list when servers exist', async () => {
    setServers([{
      id: 'unraid-1',
      name: 'Unraid Server',
      device_type: 'unraid',
      hostname: '<device>.<tailnet>.ts.net',
    }]);
    render(wrap());
    await waitFor(() => expect(screen.getByText('Unraid Server')).toBeInTheDocument());
  });
});
