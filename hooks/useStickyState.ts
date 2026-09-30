'use client';

import { useState, useEffect, useRef } from 'react';

// Drop-in replacement for useState that persists the value to sessionStorage
// under a namespaced key. When the user opens a detail page and presses Back,
// the list component remounts and this hook restores the previous value — so
// filters, search, pagination and sorting survive the round-trip.
//
// sessionStorage (not localStorage) = per-tab and cleared when the tab closes,
// which is exactly right for transient list state. All access is wrapped in
// try/catch so private mode / disabled storage degrades to plain useState.
export function useStickyState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = `sticky:${key}`;
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* ignore — storage unavailable */
    }
  }, [storageKey, state]);

  return [state, setState];
}

// Best-effort scroll-position restoration for a list page. Pass a stable `key`
// and a `ready` flag that flips true once the list content has rendered (e.g.
// !isLoading). Saves the window scroll offset continuously and restores it once
// the content exists to scroll to.
export function useStickyScroll(key: string, ready: boolean): void {
  const storageKey = `sticky-scroll:${key}`;
  const restored = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      try {
        window.sessionStorage.setItem(storageKey, String(window.scrollY));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [storageKey]);

  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      const y = raw != null ? Number(raw) : 0;
      if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
    } catch {
      /* ignore */
    }
  }, [ready, storageKey]);
}
