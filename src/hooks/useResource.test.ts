import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useResource } from './useResource';

describe('useResource', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gates loading until every loader has settled', async () => {
    let resolveB: (v: string) => void = () => {};
    const loaderA = vi.fn().mockResolvedValue('a');
    const loaderB = vi.fn().mockReturnValue(new Promise<string>((r) => { resolveB = r; }));

    const { result } = renderHook(() =>
      useResource({ a: loaderA, b: loaderB }, []),
    );

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveB('b');
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data.a).toBe('a');
    expect(result.current.data.b).toBe('b');
  });

  it('isolates per-resource failure but still releases the loading gate', async () => {
    const good = vi.fn().mockResolvedValue(42);
    const bad = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const { result } = renderHook(() => useResource({ good, bad }, []));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data.good).toBe(42);
    expect(result.current.data.bad).toBeNull();
    expect(result.current.errors.bad).toBe('Connection refused');
    expect(result.current.errors.good).toBeUndefined();
  });

  it('keeps previously-good data when a later refresh fails', async () => {
    const flaky = vi
      .fn()
      .mockResolvedValueOnce('first')
      .mockRejectedValue(new Error('gone'));

    const { result } = renderHook(() => useResource({ flaky }, [], 1000));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data.flaky).toBe('first');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    // Data survives the failure; only the error is added.
    expect(result.current.data.flaky).toBe('first');
    expect(result.current.errors.flaky).toBe('gone');
  });

  it('clears an error once the loader recovers', async () => {
    const flaky = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue('recovered');

    const { result } = renderHook(() => useResource({ flaky }, [], 1000));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.errors.flaky).toBe('boom');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.errors.flaky).toBeUndefined();
    expect(result.current.data.flaky).toBe('recovered');
  });

  it('re-runs loaders on the refresh interval', async () => {
    const loader = vi.fn().mockResolvedValue('v');
    renderHook(() => useResource({ loader }, [], 1000));

    await waitFor(() => expect(loader).toHaveBeenCalled());
    const afterMount = loader.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    // Two interval ticks, tolerating scheduler jitter.
    expect(loader.mock.calls.length).toBeGreaterThanOrEqual(afterMount + 2);
  });

  it('refetches when a dependency changes', async () => {
    const loader = vi.fn().mockResolvedValue('v');
    const { rerender } = renderHook(
      ({ id }: { id: string }) => useResource({ loader }, [id]),
      { initialProps: { id: 'server-1' } },
    );

    await waitFor(() => expect(loader).toHaveBeenCalled());
    const afterFirst = loader.mock.calls.length;

    rerender({ id: 'server-2' });
    await waitFor(() => expect(loader.mock.calls.length).toBeGreaterThan(afterFirst));
  });

  it('does not poll when the interval is zero', async () => {
    const loader = vi.fn().mockResolvedValue('v');
    renderHook(() => useResource({ loader }, []));

    await waitFor(() => expect(loader).toHaveBeenCalled());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
