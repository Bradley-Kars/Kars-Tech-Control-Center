import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ServicePage } from './ServicePage';

vi.mock('../lib/tauri-commands', () => ({
  getServers: vi.fn().mockResolvedValue([]),
  meshcentralShellFleet: vi.fn().mockResolvedValue([]),
}));

const wrap = (serviceId: string) => (
  <MemoryRouter initialEntries={['/service/' + serviceId]}>
    <Routes>
      <Route path="service/:serviceId" element={<ServicePage />} />
    </Routes>
  </MemoryRouter>
);

describe('ServicePage', () => {
  it('renders "Service not found" for unknown serviceId', () => {
    render(wrap('nonexistent'));
    expect(screen.getByText('Service not found')).toBeInTheDocument();
  });

  it('renders "Server required" when serviceId=docker and no unraid server', async () => {
    render(wrap('docker'));
    await waitFor(() => expect(screen.getByText('Server required')).toBeInTheDocument());
    expect(screen.getByText('Docker runs on the Unraid server, and no server is configured yet.')).toBeInTheDocument();
  });

  it('renders a "Configure server" CTA linking to /settings when no server is configured', async () => {
    render(wrap('docker'));
    await waitFor(() => expect(screen.getByText('Server required')).toBeInTheDocument());
    const cta = screen.getByRole('button', { name: /configure server/i });
    expect(cta).toBeInTheDocument();
    expect(cta.closest('a')?.getAttribute('href')).toBe('/settings');
  });
});
