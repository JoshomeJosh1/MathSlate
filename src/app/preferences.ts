import { createStore, useStore } from '../document/store';

/**
 * Per-browser display preferences (not part of a document): remembered in localStorage when it
 * is available, otherwise for this visit only.
 */
export interface Preferences {
  /** Show results as decimals only, where they have one (the header's "Decimals" switch). */
  decimals: boolean;
}

const STORAGE_KEY = 'mathslate.preferences.v1';

function load(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed === 'object' && parsed !== null && 'decimals' in parsed) {
      return { decimals: parsed.decimals === true };
    }
  } catch {
    // Storage unavailable or corrupt: defaults.
  }
  return { decimals: false };
}

export const preferences = createStore<Preferences>(load());

preferences.subscribe(() => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences.get()));
  } catch {
    // Not saved; the preference still applies for this visit.
  }
});

export function usePreferences(): Preferences {
  return useStore(preferences);
}
