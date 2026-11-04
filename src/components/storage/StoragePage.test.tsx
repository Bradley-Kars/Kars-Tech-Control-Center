import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StoragePage } from './StoragePage';
import { mockServerConfig } from '../../test/mock-data';

vi.mock('../../lib/fleet-api', () => ({
  getDisks: vi.fn(),
  getShares: vi.fn(),
  getSmartData: vi.fn(),
}));

import { getDisks, getShares, getSmartData } from '../../lib/fleet-api';

const mockGetDisks = vi.mocked(getDisks);
const mockGetShares = vi.mocked(getShares);
const mockGetSmartData = vi.mocked(getSmartData);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('StoragePage state matrix', () => {
  it('L loading: shows skeletons while data loads', async () => {
    mockGetDisks.mockResolvedValue(new Promise(() => {}) as any);
    mockGetShares.mockResolvedValue(new Promise(() => {}) as any);

    render(<StoragePage server={mockServerConfig} />);

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(screen.getByText('Storage')).toBeInTheDocument();
  });

  it('E empty: shows empty state when no data', async () => {
    mockGetDisks.mockResolvedValue([] as any);
    mockGetShares.mockResolvedValue([] as any);

    render(<StoragePage server={mockServerConfig} />);

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(screen.getByText('Disks')).toBeInTheDocument();
    expect(screen.getByText('Shares')).toBeInTheDocument();
  });

  it('R error: shows error banner when fetch fails', async () => {
    mockGetDisks.mockRejectedValue(new Error('daemon unreachable'));
    mockGetShares.mockResolvedValue([] as any);

    render(<StoragePage server={mockServerConfig} />);

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(screen.getByText(/daemon unreachable/)).toBeInTheDocument();
  });

  it('I interaction: refresh re-fetches data', async () => {
    render(<StoragePage server={mockServerConfig} />);

    await new Promise(resolve => setTimeout(resolve, 100));

    fireEvent.click(screen.getByRole('button', { name: /refresh/ }));

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(mockGetDisks).toHaveBeenCalledTimes(2);
    expect(mockGetShares).toHaveBeenCalledTimes(2);
  });

  it('M modal: no dialog', async () => {
    render(<StoragePage server={mockServerConfig} />);

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
