import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../context/AppContext';
import { ChatPage } from './ChatPage';

vi.mock('../components/opencode/ChatPanel', () => ({
  ChatPanel: () => <div data-testid="chat-panel">Chat Panel Placeholder</div>,
}));

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

const wrap = () => (
  <AppProvider>
    <MemoryRouter initialEntries={['/chat']}>
      <ChatPage />
    </MemoryRouter>
  </AppProvider>
);

describe('ChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders chat panel', () => {
    render(wrap());
    expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
    expect(screen.getByText('Chat Panel Placeholder')).toBeInTheDocument();
  });
});
