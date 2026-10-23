import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { HomeAssistantPage } from './HomeAssistantPage';
import { mockServerConfig, mockHomeAssistantConfig, mockHomeAssistantStates } from '../../test/mock-data';

vi.mock('../../lib/tauri-commands', () => ({
  getHomeAssistantStates: vi.fn(),
  getHomeAssistantConfig: vi.fn(),
  homeAssistantToggle: vi.fn(),
  homeAssistantTurnOn: vi.fn(),
  homeAssistantTurnOff: vi.fn(),
}));

import { getHomeAssistantStates, getHomeAssistantConfig } from '../../lib/tauri-commands';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getHomeAssistantStates).mockResolvedValue(mockHomeAssistantStates as any);
  vi.mocked(getHomeAssistantConfig).mockResolvedValue(mockHomeAssistantConfig as any);
});

describe('HomeAssistantPage', () => {
  it('renders Home Assistant title after loading', async () => {
    render(<HomeAssistantPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Home Assistant')).toBeInTheDocument();
    });
  });

  it('displays version info', async () => {
    render(<HomeAssistantPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Home Assistant')).toBeInTheDocument();
    });
    expect(screen.getByText('2024.8.3')).toBeInTheDocument();
  });

  it('shows entity count in overview', async () => {
    render(<HomeAssistantPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Entities')).toBeInTheDocument();
    });
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows integrations count in overview', async () => {
    render(<HomeAssistantPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Integrations')).toBeInTheDocument();
    });
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('shows tab buttons', async () => {
    render(<HomeAssistantPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Home Assistant')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'overview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'states' })).toBeInTheDocument();
  });

  it('navigates to states tab', async () => {
    render(<HomeAssistantPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Home Assistant')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'states' }));
    await waitFor(() => {
      expect(screen.getByText('light.living_room')).toBeInTheDocument();
    });
    expect(screen.getByText('switch.kitchen')).toBeInTheDocument();
    expect(screen.getByText('sensor.temperature')).toBeInTheDocument();
  });

  it('states tab shows state badges', async () => {
    render(<HomeAssistantPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Home Assistant')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'states' }));
    await waitFor(() => {
      expect(screen.getAllByText('on').length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByText('off')).toBeInTheDocument();
    expect(screen.getByText('72.5')).toBeInTheDocument();
  });
});
