import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode, type Dispatch, type SetStateAction } from 'react';

// Types
export interface ServerConfig {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  device_type: 'unraid' | 'phone' | 'handheld' | 'laptop' | 'desktop';
  auth: { type: 'password' | 'key'; password?: string; key_path?: string };
  api_key?: string;
  service_keys: Record<string, string | undefined>;
}

interface AppContextValue {
  // Theme
  theme: 'dark' | 'light' | 'system';
  setTheme: Dispatch<SetStateAction<'dark' | 'light' | 'system'>>;
  resolvedTheme: 'dark' | 'light';

  // Density
  density: 'comfortable' | 'compact';
  setDensity: Dispatch<SetStateAction<'comfortable' | 'compact'>>;

  // Animations
  reducedMotion: boolean;
  setReducedMotion: Dispatch<SetStateAction<boolean>>;

  // Notifications
  notificationsEnabled: boolean;
  setNotificationsEnabled: Dispatch<SetStateAction<boolean>>;

  // Sidebar
  sidebarCollapsed: boolean;
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>;

  // Toast
  addToast: (toast: Omit<import('../components/ui/Toast').ToastProps, 'id' | 'onClose'>) => string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  // Theme
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('kts-theme') as 'dark' | 'light' | 'system') || 'dark';
    }
    return 'dark';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const updateTheme = () => {
      const resolved = theme === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : theme;
      setResolvedTheme(resolved);
      root.setAttribute('data-theme', resolved);
      localStorage.setItem('kts-theme', theme);
    };

    updateTheme();
    mediaQuery.addEventListener('change', updateTheme);
    return () => mediaQuery.removeEventListener('change', updateTheme);
  }, [theme]);

  // Density
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('kts-density') as 'comfortable' | 'compact') || 'comfortable';
    }
    return 'comfortable';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
    localStorage.setItem('kts-density', density);
  }, [density]);

  // Reduced motion
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Notifications
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('kts-notifications') !== 'false';
    }
    return true;
  });

  useEffect(() => {
    localStorage.setItem('kts-notifications', String(notificationsEnabled));
  }, [notificationsEnabled]);

  // Sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Toast (handled by ToastManager, but we can provide a helper)
  const addToast = useCallback((toast: any) => {
    // This would be connected to the ToastManager via context
    // For now, we'll use a custom event
    const event = new CustomEvent('kts:toast', { detail: toast });
    window.dispatchEvent(event);
    return `toast-${Date.now()}`;
  }, []);

  const value = useMemo(() => ({
    theme,
    setTheme,
    resolvedTheme,
    density,
    setDensity,
    reducedMotion,
    setReducedMotion,
    notificationsEnabled,
    setNotificationsEnabled,
    sidebarCollapsed,
    setSidebarCollapsed,
    addToast,
  }), [theme, resolvedTheme, density, reducedMotion, notificationsEnabled, sidebarCollapsed]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}