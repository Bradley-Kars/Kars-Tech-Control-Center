import { useState, useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useMediaQuery, useServers, useLocalStats, useFleetStats } from './hooks';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { CommandPalette } from './components/layout/CommandPalette';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { ToastManager, useToast } from './components/ui/Toast';
import { AppProvider } from './context/AppContext';
import { DashboardPage } from './pages/DashboardPage';
import { DevicePage } from './pages/DevicePage';
import { ServicePage } from './pages/ServicePage';
import { SettingsPage } from './pages/SettingsPage';
import { MeshCentralPage } from './pages/MeshCentralPage';
import { FleetCommandPage } from './pages/FleetCommandPage';
import { CompliancePage } from './pages/CompliancePage';
import { AlertCenter } from './components/alerts/AlertCenter';
import { ChatPage } from './pages/ChatPage';
import { TicketingPage } from './pages/TicketingPage';
import { useKiosk } from './hooks/useKiosk';
import { metricCollectAll, pollAllAlertSources } from './lib/tauri-commands';
import './styles/globals.css';

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 860px)');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { servers } = useServers();
  const { refresh: refreshLocal } = useLocalStats();
  const { refresh: refreshFleet } = useFleetStats(servers);
  const { toasts, removeToast, addToast } = useToast();
  const { isKiosk, cursorHidden } = useKiosk();

  // Bridge AppContext's kts:toast event into the live toast list
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail === 'object') addToast(detail);
    };
    window.addEventListener('kts:toast', handler);
    return () => window.removeEventListener('kts:toast', handler);
    // addToast closes over stable setState only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global refresh event (dispatched by dashboard quick actions, ⌘R, etc.)
  useEffect(() => {
    const handler = () => {
      refreshFleet();
      refreshLocal();
    };
    window.addEventListener('kts:refresh', handler);
    return () => window.removeEventListener('kts:refresh', handler);
  }, [refreshFleet, refreshLocal]);

  // Metric history collector — MC-primary fleet stats into SQLite every 60s,
  // feeding HistoricalCharts. Rust side prunes to 30 days. Errors are swallowed:
  // transient transport failures must not toast every tick.
  useEffect(() => {
    void metricCollectAll().catch(() => {});
    const t = window.setInterval(() => {
      void metricCollectAll().catch(() => {});
    }, 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Unified alert intake — poll Prometheus (/api/v1/alerts) + MeshCentral status
  // changes every 60s. Derive Prometheus base from Unraid server's tailnet IP.
  // Errors swallowed to avoid toast spam.
  useEffect(() => {
    const run = async () => {
      const unraid = servers.find(s => s.device_type === 'unraid');
      const base = unraid?.service_keys?.tailscale_ip
        ? `http://${unraid.service_keys.tailscale_ip}:9090`
        : null;
      if (base) {
        try { await pollAllAlertSources(base); } catch {}
      }
    };
    void run().catch(() => {});
    const t = window.setInterval(() => void run().catch(() => {}), 60_000);
    return () => window.clearInterval(t);
  }, [servers]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      // Refresh fleet + local data (palette's "Refresh All Data" advertises ⌘R;
      // preventDefault keeps the webview from doing a full reload)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('kts:refresh'));
        return;
      }

      // Escape: the palette handles its own Escape (it may need to disarm a
      // pending destructive confirm first), so leave it alone while open.
      if (e.key === 'Escape') {
        if (commandPaletteOpen) return;
        setSidebarOpen(false);
        return;
      }

      // Number keys for main navigation
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        const shortcuts: Record<string, string> = {
          '1': '/',
          '2': '/device/local',
          '3': '/device/unraid',
          '4': '/device/phone',
          '5': '/device/ally',
          'd': '/service/docker',
          's': '/service/storage',
          'y': '/service/system',
          'n': '/service/network',
        };
        const path = shortcuts[e.key.toLowerCase()];
        if (path) {
          e.preventDefault();
          navigate(path);
        }
      }

      // G + letter for services
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Could implement chord shortcuts here
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, commandPaletteOpen]);

  // Auto-close sidebar on mobile after navigation
  useEffect(() => {
    if (isMobile && sidebarOpen) {
      setSidebarOpen(false);
    }
  }, [location.pathname, isMobile]);

  const sidebarContent = useMemo(() => (
    <Sidebar
      onNavigate={navigate}
      collapsed={sidebarCollapsed}
      onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
    />
  ), [navigate, sidebarCollapsed]);

  return (
    <div className={[
      'app-shell flex h-screen w-screen bg-[var(--kts-bg-primary)] overflow-hidden',
      isKiosk && 'kiosk-mode',
      cursorHidden && 'cursor-hidden',
    ].join(' ')}>
      {/* Sidebar */}
      <aside
        className={[
          'sidebar fixed left-0 top-0 z-[var(--kts-z-sticky)] h-full transition-all duration-[var(--kts-motion-base)] ease-[var(--kts-easing-ease-out)]',
          isMobile
            ? sidebarOpen
              ? 'w-full translate-x-0'
              : '-translate-x-full w-full'
            : sidebarCollapsed
            ? 'w-[56px]'
            : 'w-[232px]',
        ].join(' ')}
        style={{
          background: 'var(--kts-bg-secondary)',
          borderRight: '1px solid var(--kts-border-default)',
        }}
        aria-label="Main navigation"
      >
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-[calc(var(--kts-z-sticky)-1)] bg-[var(--kts-color-ink-alpha-25)]"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main content area */}
      <main
        className={[
          'flex-1 flex flex-col overflow-hidden transition-all duration-[var(--kts-motion-base)]',
          isMobile ? 'ml-0' : sidebarCollapsed ? 'ml-[56px]' : 'ml-[232px]',
        ].join(' ')}
      >
        {/* Top Bar */}
        <TopBar
          location={location}
          onMenuClick={() => setSidebarOpen(true)}
          onCommandPalette={() => setCommandPaletteOpen(true)}
        />

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto" style={{ padding: 'var(--kts-space-6)' }}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>

      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        servers={servers}
        location={location}
        navigate={navigate}
      />

      {/* Toasts */}
      <ToastManager toasts={toasts} onClose={removeToast} position="top-right" />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            {/* Fleet Overview */}
            <Route index element={<Navigate to="/ticketing" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />

            {/* Device Pages */}
            <Route path="device/:deviceId" element={<DevicePage />} />

            {/* Service Pages */}
            <Route path="service/:serviceId" element={<ServicePage />} />

            {/* Management Pages */}
            <Route path="meshcentral" element={<MeshCentralPage />} />
            <Route path="fleet-command" element={<FleetCommandPage />} />
            <Route path="compliance" element={<CompliancePage />} />
            <Route path="alerts" element={<AlertCenter />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="ticketing" element={<TicketingPage />} />

            {/* Settings */}
            <Route path="settings/*" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
