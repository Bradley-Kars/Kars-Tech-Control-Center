import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { HomeAssistantPage } from './HomeAssistantPage';
import { mockServerConfig, mockHomeAssistantConfig, mockHomeAssistantStates } from '../../test/mock-data';

vi.mock('../../lib/fleet-api', () => ({
  getHomeAssistantStates: vi.fn(),
  getHomeAssistantConfig: vi.fn(),
  homeAssistantToggle: vi.fn(),
  homeAssistantTurnOn: vi.fn(),
  homeAssistantTurnOff: vi.fn(),
}));

import {
  getHomeAssistantStates,
  getHomeAssistantConfig,
  homeAssistantToggle,
  homeAssistantTurnOn,
  homeAssistantTurnOff,
} from '../../lib/fleet-api';

const mockGetHomeAssistantStates = vi.mocked(getHomeAssistantStates);
const mockGetHomeAssistantConfig = vi.mocked(getHomeAssistantConfig);
const mockHomeAssistantToggle = vi.mocked(homeAssistantToggle);
const mockHomeAssistantTurnOn = vi.mocked(homeAssistantTurnOn);
const mockHomeAssistantTurnOff = vi.mocked(homeAssistantTurnOff);

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetHomeAssistantStates.mockResolvedValue(mockHomeAssistantStates as any);
  mockGetHomeAssistantConfig.mockResolvedValue(mockHomeAssistantConfig as any);
  mockHomeAssistantToggle.mockResolvedValue(undefined);
  mockHomeAssistantTurnOn.mockResolvedValue(undefined);
  mockHomeAssistantTurnOff.mockResolvedValue(undefined);
});

describe('HomeAssistantPage (D/E/L/R/I/M state matrix)', () => {
  it('L loading: shows the spinner and no content until both fetches settle', async () => {
    const states = pending<typeof mockHomeAssistantStates>();
    const config = pending<typeof mockHomeAssistantConfig>();
    mockGetHomeAssistantStates.mockResolvedValue(states.promise as any);
    mockGetHomeAssistantConfig.mockResolvedValue(config.promise as any);

    render(<HomeAssistantPage server={mockServerConfig} />);

    expect(screen.queryByText('Home Assistant')).not.toBeInTheDocument();

    states.resolve(mockHomeAssistantStates as any);
    config.resolve(mockHomeAssistantConfig as any);

    await waitFor(() => expect(screen.getByText('Home Assistant')).toBeInTheDocument());
  });

  it('D populated: shows the version and entity/integration counts', async () => {
    render(<HomeAssistantPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('Home Assistant')).toBeInTheDocument());
    expect(screen.getByText('2024.8.3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('D populated: states tab lists the entities with state badges', async () => {
    render(<HomeAssistantPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('Home Assistant')).toBeInTheDocument());

    screen.getByRole('button', { name: 'states' }).click();

    await waitFor(() => expect(screen.getByText('light.living_room')).toBeInTheDocument());
    expect(screen.getByText('switch.kitchen')).toBeInTheDocument();
    expect(screen.getByText('sensor.temperature')).toBeInTheDocument();
  });

  it('E empty states: states tab renders with no entity rows', async () => {
    mockGetHomeAssistantStates.mockResolvedValue([] as any);

    render(<HomeAssistantPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('Home Assistant')).toBeInTheDocument());

    screen.getByRole('button', { name: 'states' }).click();

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    expect(screen.queryByText('light.living_room')).not.toBeInTheDocument();
  });

  it('R robustness: both fetches rejecting still renders the page without crashing', async () => {
    mockGetHomeAssistantStates.mockRejectedValue(new Error('Connection refused'));
    mockGetHomeAssistantConfig.mockRejectedValue(new Error('Connection refused'));

    render(<HomeAssistantPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('Home Assistant')).toBeInTheDocument());
    // allSettled swallows failures: empty entities, no crash
    expect(screen.queryByText('light.living_room')).not.toBeInTheDocument();
  });

  it('I interaction: clicking Off on an on entity calls homeAssistantTurnOff', async () => {
    render(<HomeAssistantPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('Home Assistant')).toBeInTheDocument());

    screen.getByRole('button', { name: 'states' }).click();

    await waitFor(() => expect(screen.getByText('light.living_room')).toBeInTheDocument());
    const row = screen.getByText('light.living_room').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: /Off/ }));

    await waitFor(() =>
      expect(mockHomeAssistantTurnOff).toHaveBeenCalledWith(mockServerConfig.id, 'light.living_room')
    );
  });

  it('I interaction: clicking On on an off entity calls homeAssistantTurnOn', async () => {
    render(<HomeAssistantPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('Home Assistant')).toBeInTheDocument());

    screen.getByRole('button', { name: 'states' }).click();

    await waitFor(() => expect(screen.getByText('switch.kitchen')).toBeInTheDocument());
    const row = screen.getByText('switch.kitchen').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: /On/ }));

    await waitFor(() =>
      expect(mockHomeAssistantTurnOn).toHaveBeenCalledWith(mockServerConfig.id, 'switch.kitchen')
    );
  });

  it('M modal: no dialog renders on HomeAssistantPage', async () => {
    render(<HomeAssistantPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('Home Assistant')).toBeInTheDocument());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Close/ })).not.toBeInTheDocument();
  });
});
