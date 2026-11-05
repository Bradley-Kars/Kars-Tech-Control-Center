import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, fireEvent, act } from '@testing-library/react';
import { useToast, ToastManager } from './Toast';
import type { ToastItem } from './Toast';

function makeToast(id: string, type: ToastItem['type'] = 'success', title = 'Title'): ToastItem {
  return { key: id, id, type, title, onClose: vi.fn() };
}

function ToastHarness() {
  const { toasts, addToast, dismissAll, removeToast } = useToast();
  return (
    <div>
      <button
        data-testid="add"
        onClick={() =>
          addToast({ type: 'success', title: 'Deploy complete', message: 'v1.2.3 deployed' })
        }
      >
        Add
      </button>
      <button
        data-testid="add-other"
        onClick={() => addToast({ type: 'error', title: 'Something else', message: 'boom' })}
      >
        Add other
      </button>
      <button data-testid="dismiss-all" onClick={dismissAll}>
        Dismiss all
      </button>
      <ToastManager toasts={toasts} onClose={removeToast} position="top-right" />
    </div>
  );
}

describe('ToastManager dedupe by (type, title)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('collapses duplicate toasts by (type, title) into one', () => {
    render(<ToastHarness />);
    const add = screen.getByTestId('add');
    fireEvent.click(add);
    fireEvent.click(add);
    expect(screen.getAllByText('Deploy complete')).toHaveLength(1);
    expect(screen.getAllByText('v1.2.3 deployed')).toHaveLength(1);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('keeps toasts that differ by type or by title', () => {
    render(<ToastHarness />);
    fireEvent.click(screen.getByTestId('add'));
    fireEvent.click(screen.getByTestId('add-other'));
    expect(screen.getAllByText('Deploy complete')).toHaveLength(1);
    expect(screen.getAllByText('Something else')).toHaveLength(1);
    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });

  it('does not dedupe the same title with a different type', () => {
    render(<ToastHarness />);
    fireEvent.click(screen.getByTestId('add'));
    fireEvent.click(screen.getByTestId('add-other'));
    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });

  it('exposes dedupe through addToast directly', () => {
    const hook = renderHook(() => useToast());
    act(() => {
      hook.result.current.addToast({ type: 'success', title: 'Same title', message: 'a' });
    });
    hook.rerender();
    expect(hook.result.current.toasts).toHaveLength(1);
    act(() => {
      hook.result.current.addToast({ type: 'success', title: 'Same title', message: 'b' });
    });
    hook.rerender();
    expect(hook.result.current.toasts).toHaveLength(1);
    // same title, different type is not deduped
    act(() => {
      hook.result.current.addToast({ type: 'error', title: 'Same title', message: 'c' });
    });
    hook.rerender();
    expect(hook.result.current.toasts).toHaveLength(2);
  });
});

describe('ToastManager Dismiss all', () => {
  it('dismiss-all button removes every toast', () => {
    render(<ToastHarness />);
    fireEvent.click(screen.getByTestId('add'));
    fireEvent.click(screen.getByTestId('add-other'));
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('dismiss-all'));
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });
});

describe('ToastManager overlay click-outside dismiss', () => {
  it('dismisses every toast when the overlay is clicked', () => {
    const onClose = vi.fn();
    const toasts: ToastItem[] = [makeToast('a'), makeToast('b', 'error')];
    render(<ToastManager toasts={toasts} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('toast-overlay'));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledWith('a');
    expect(onClose).toHaveBeenCalledWith('b');
  });

  it('renders no overlay when there are no toasts', () => {
    render(<ToastManager toasts={[]} onClose={vi.fn()} />);
    expect(screen.queryByTestId('toast-overlay')).not.toBeInTheDocument();
  });
});
