import { useState, useEffect, useCallback } from 'react';

export function useKiosk() {
  const [isKiosk, setIsKiosk] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load persisted kiosk state on mount
  useEffect(() => {
    const stored = localStorage.getItem('kts:kiosk');
    if (stored === 'true') {
      enterKiosk();
    }
  }, []);

  const resetCursorTimer = useCallback(() => {
    if (!isKiosk) return;
    setCursorHidden(false);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setCursorHidden(true);
    }, 5000);
  }, [isKiosk]);

  const enterKiosk = useCallback(async () => {
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen({ navigationUI: 'hide' });
      }
      setIsKiosk(true);
      localStorage.setItem('kts:kiosk', 'true');
      resetCursorTimer();
      
      // Listen for mouse movement to reset cursor timer
      document.addEventListener('mousemove', resetCursorTimer);
      document.addEventListener('keydown', resetCursorTimer);
      document.addEventListener('click', resetCursorTimer);
    } catch (e) {
      console.warn('Failed to enter kiosk mode:', e);
    }
  }, [resetCursorTimer]);

  const exitKiosk = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.warn('Failed to exit fullscreen:', e);
    }
    setIsKiosk(false);
    localStorage.setItem('kts:kiosk', 'false');
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setCursorHidden(false);
    document.removeEventListener('mousemove', resetCursorTimer);
    document.removeEventListener('keydown', resetCursorTimer);
    document.removeEventListener('click', resetCursorTimer);
  }, [resetCursorTimer]);

  const toggleKiosk = useCallback(() => {
    if (isKiosk) exitKiosk(); else enterKiosk();
  }, [isKiosk, enterKiosk, exitKiosk]);

  // Handle fullscreen change (user pressed F11 or ESC)
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement && isKiosk) {
        // User exited fullscreen via browser UI
        setIsKiosk(false);
        localStorage.setItem('kts:kiosk', 'false');
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        setCursorHidden(false);
      }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [isKiosk]);

  // Global keyboard shortcut: F11 toggles kiosk
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleKiosk();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggleKiosk]);

  return {
    isKiosk,
    cursorHidden,
    enterKiosk,
    exitKiosk,
    toggleKiosk,
  };
}

// Need to import useRef
import { useRef } from 'react';