import { documentationDoc } from './documentation';
import { newId, type Doc } from './model';
import type { Store } from './store';

/**
 * Where this tab's slate is saved. The main slate has one fixed slot; a slate opened in a new tab
 * (New / Documentation → Open in new tab) has its own, named by `?slate=<id>` in the address,
 * so tabs do not save over each other and a reload or bookmark finds it again.
 */
export const MAIN_KEY = 'mathslate.doc.v1';
export const SLOT_PREFIX = 'mathslate.doc.slate.';
/** Where a slate is saved: its slot, or the main slate's (null). */
export const keyOf = (id: string | null) => (id === null ? MAIN_KEY : SLOT_PREFIX + id);
/** When a slate (by its key) was last edited, ms since 1970, kept beside it. */
export const updatedKey = (key: string) => `${key}.updated`;

function currentSlate(): string | null {
  try {
    return new URLSearchParams(location.search).get('slate');
  } catch {
    return null; // no location (tests)
  }
}

/** The slate this tab shows: its id from `?slate=`, or null for the main slate. */
export const CURRENT_SLATE = currentSlate();
const STORAGE_KEY = keyOf(CURRENT_SLATE);

/** A storage key for things kept alongside this tab's slate (e.g. the slate a link replaced). */
export function slateKey(suffix: string): string {
  return `${STORAGE_KEY}.${suffix}`;
}

/**
 * Opens `doc` in a new tab, in a slot of its own. Returns false if it could not (storage or
 * pop-ups blocked).
 */
export function openInNewTab(doc: Doc): boolean {
  const id = newId();
  try {
    localStorage.setItem(keyOf(id), JSON.stringify(doc));
    localStorage.setItem(updatedKey(keyOf(id)), String(Date.now()));
  } catch {
    return false;
  }
  const url = new URL(location.href);
  url.hash = '';
  url.searchParams.set('slate', id);
  return window.open(url.toString(), '_blank') !== null;
}

/** Whether this browser has a slate of the user's saved (not just the first-visit default). */
export function hasSavedDoc(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function isDoc(value: unknown): value is Doc {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<Doc>;
  return (
    v.version === 1 &&
    Array.isArray(v.rows) &&
    v.rows.length > 0 &&
    v.rows.every(
      (r) => typeof r.id === 'string' && typeof r.latex === 'string' && Array.isArray(r.outputs),
    ) &&
    typeof v.interpretations === 'object' &&
    typeof v.nextOutputLabel === 'number'
  );
}

export function loadDoc(): Doc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isDoc(parsed)) return parsed;
    }
  } catch {
    // Storage unavailable or corrupt: fall through to the documentation slate.
  }
  return documentationDoc();
}

/** Saves the document (debounced) whenever the store changes. Returns an unsubscribe function. */
export function autosave(store: Store<Doc>, delayMs = 300): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  const save = () => {
    if (!dirty) return;
    dirty = false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store.get()));
      localStorage.setItem(updatedKey(STORAGE_KEY), String(Date.now()));
    } catch {
      // Quota exceeded or storage disabled; nothing useful to do.
    }
  };
  const unsubscribe = store.subscribe(() => {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(save, delayMs);
  });
  const flush = () => {
    clearTimeout(timer);
    save();
  };
  window.addEventListener('beforeunload', flush);
  return () => {
    unsubscribe();
    window.removeEventListener('beforeunload', flush);
  };
}
