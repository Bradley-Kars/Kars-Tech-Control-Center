import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Sidebar, type SidebarProps } from './Sidebar';
import { SIDEBAR_GROUPS } from '../../config/nav';
import { ServicePage } from '../../pages/ServicePage';
import { TicketingPage } from '../../components/ticketing/TicketingPage';
import { ChatPage } from '../../pages/ChatPage';
import { SettingsPage } from '../../pages/SettingsPage';
import { AppProvider } from '../../context/AppContext';

function renderSidebar(overrides: Partial<SidebarProps> = {}, initialEntries: string[] = ['/']) {
  const props: SidebarProps = {
    onNavigate: vi.fn(),
    collapsed: false,
    onToggleCollapse: vi.fn(),
    ...overrides,
  };
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Sidebar {...props} />
    </MemoryRouter>
  );
}

const GROUP_LABELS: Array<string> = SIDEBAR_GROUPS.map((g) => g.label);

const LINKS: Array<[label: string, path: string]> = SIDEBAR_GROUPS.flatMap((g) =>
  g.pages.map((p) => [p.label, p.href] as [string, string]),
);

describe('Sidebar', () => {
  it('renders KTS Master Control branding', () => {
    renderSidebar();
    expect(screen.getByText('KTS')).toBeInTheDocument();
    expect(screen.getByText('Master Control')).toBeInTheDocument();
  });

  it('renders the KTS logo image in the expanded sidebar header', () => {
    renderSidebar();
    expect(screen.getByAltText('KTS Master Control logo')).toBeInTheDocument();
  });

  it('keeps the KTS logo mark visible in the collapsed rail', () => {
    renderSidebar({ collapsed: true });
    expect(screen.getByAltText('KTS Master Control logo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it.each(GROUP_LABELS)('renders the %s collapsible group header', (label) => {
    renderSidebar();
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });

  it.each(LINKS)('renders the %s link with href %s', (label, path) => {
    renderSidebar();
    const link = screen.getByRole('link', { name: label });
    expect(link).toHaveAttribute('href', path);
  });

  it.each(LINKS)('navigates to %s when the %s link is clicked', (label, path) => {
    const onNavigate = vi.fn();
    renderSidebar({ onNavigate });
    const link = screen.getByRole('link', { name: label });
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledWith(path);
  });

  it('highlights the active route', () => {
    renderSidebar({}, ['/service/system']);
    expect(screen.getByRole('link', { name: 'System' })).toHaveClass(/bg-\[var\(--kts-brand-primary-bg\)\]/);
  });

  it('collapses and expands a section', () => {
    renderSidebar();
    expect(screen.getByText('Docker')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Services' }));
    expect(screen.queryByText('Docker')).not.toBeInTheDocument();
    expect(screen.queryByText('Storage')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Services' }));
    expect(screen.getByText('Docker')).toBeInTheDocument();
  });

  it('renders collapsed sidebar as icon-only rail (labels hidden)', () => {
    const { container } = renderSidebar({ collapsed: true });
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    for (const [label] of LINKS) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    // Icons still render for every link.
    expect(container.querySelectorAll('svg.lucide').length).toBeGreaterThan(0);
  });

  it('calls onToggleCollapse when expand is clicked while collapsed', () => {
    const onToggleCollapse = vi.fn();
    renderSidebar({ collapsed: true, onToggleCollapse });
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(onToggleCollapse).toHaveBeenCalled();
  });

  it('calls onToggleCollapse when collapse is clicked while expanded', () => {
    const onToggleCollapse = vi.fn();
    renderSidebar({ onToggleCollapse });
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(onToggleCollapse).toHaveBeenCalled();
  });

  it('does not render MySpeed anywhere', () => {
    renderSidebar();
    expect(screen.queryByText('MySpeed')).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* Route rendering against the stub backend: every sidebar link points
 * at a route that must render (no crash, no console errors) with the
 * API modules mocked out. No real host, no network, no real vault. */
/* ------------------------------------------------------------------ */
describe('Sidebar routes against the stub backend', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    consoleError.mockClear();
  });

  afterAll(() => {
    consoleError.mockRestore();
  });

  vi.mock('../../lib/api', () => ({
    listTickets: vi.fn().mockResolvedValue({ count: 0, tickets: [] }),
    createTicket: vi.fn().mockResolvedValue({ ticket_id: 'NEW-1', title: '', status: 'new', version: 1 }),
    addWorklog: vi.fn().mockResolvedValue({ ticket_id: 'TKT-1', version: 1, worklog_count: 1 }),
    changeTicketStatus: vi.fn().mockResolvedValue({ ticket_id: 'TKT-1', status: 'new', version: 1 }),
    updateTicket: vi.fn().mockResolvedValue({ ticket_id: 'TKT-1', title: '', status: 'new', version: 1 }),
    getTicketDetail: vi.fn().mockResolvedValue({
      id: 'TKT-1', title: 't', status: 'open', client_name: 'c', priority: 'medium',
      description: '', worklog: [], hours: 0, total: 0, invoice_number: null, no_charge: false,
    }),
    generateInvoice: vi.fn().mockResolvedValue({ invoice_id: 'INV-1', ticket_id: 'TKT-1', amount: 0, status: 'issued' }),
  }));

  vi.mock('../lib/fleet-api', () => ({
    getServers: vi.fn().mockResolvedValue([]),
    saveServer: vi.fn().mockResolvedValue(undefined),
    removeServer: vi.fn().mockResolvedValue(undefined),
    getSystemStats: vi.fn().mockResolvedValue({}),
    getLocalSystemStats: vi.fn().mockResolvedValue({}),
    meshcentralGetFleetStats: vi.fn().mockResolvedValue({}),
    meshcentralGetSystemStats: vi.fn().mockResolvedValue({}),
    terminalTicket: vi.fn().mockResolvedValue({ ticket: 'tkt-1', expires_in: 60 }),
    meshcentralSyncFleet: vi.fn().mockResolvedValue({}),
  }));

  vi.mock('../../components/terminal/EmbeddedTerminal', () => ({
    EmbeddedTerminal: () => <div data-testid="chat-stub">Hermes terminal</div>,
  }));

  // jsdom has no localStorage; AppContext (used by SettingsPage) reads it.
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    },
    writable: true,
  });

  const wrap = (path: string) => (
    <AppProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="service/:serviceId" element={<ServicePage />} />
          <Route path="ticketing" element={<TicketingPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="settings/*" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>
  );

  it.each([
    ['docker', 'Docker'],
    ['storage', 'Storage'],
    ['system', 'System'],
    ['network', 'Network'],
    ['arr', 'Arr'],
    ['homeassistant', 'Home Assistant'],
    ['nextcloud', 'Nextcloud'],
    ['adguard', 'AdGuard'],
  ])('renders /service/%s with no server configured and no console errors', async (serviceId) => {
    render(wrap('/service/' + serviceId));
    // No server is configured, so the service page shows the server-required
    // state instead of crashing or calling the real backend.
    await waitFor(() => expect(screen.getByText('Server required')).toBeInTheDocument());
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders /ticketing against the stub backend with no console errors', async () => {
    render(wrap('/ticketing'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ticketing' })).toBeInTheDocument());
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders /chat against the stub backend with no console errors', async () => {
    render(wrap('/chat'));
    expect(screen.getByTestId('chat-stub')).toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders /settings against the stub backend with no console errors', async () => {
    render(wrap('/settings'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument());
    expect(consoleError).not.toHaveBeenCalled();
  });
});
