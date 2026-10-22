import { documentationDoc } from './documentation';
import { emptyDoc, newId, type Doc } from './model';
import { createStore, type Store } from './store';

/**
 * Where slates are saved. The main slate (no `?slate=` in the address) is a scratch slate and is
 * never saved; Save gives it a slot of its own, named by `?slate=<id>`, and from then on that
 * slot saves itself on every edit, so a reload or bookmark finds it again.
 */
/** The main slate's slot before slates were saved explicitly (moved to a slot on load). */
export const MAIN_KEY = 'mathslate.doc.v1';
export const SLOT_PREFIX = 'mathslate.doc.slate.';
export const keyOf = (id: string) => SLOT_PREFIX + id;
/** When a slate (by its key) was last edited, ms since 1970, kept beside it. */
export const updatedKey = (key: string) => `${key}.updated`;

/** Storage as far as saving needs it (localStorage, or a stand-in in tests). */
export type WritableStorage = Pick<
  Storage,
  'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'
>;

function slateInAddress(): string | null {
  try {
    return new URLSearchParams(location.search).get('slate');
  } catch {
    return null; // no location (tests)
  }
}

export interface SaveState {
  /** The saved slate this tab shows, or null for the (unsaved) main slate. */
  slate: string | null;
  /** The main slate was edited since it was opened (and so would be lost). */
  edited: boolean;
}

export const saveState = createStore<SaveState>({ slate: slateInAddress(), edited: false });

/** Puts `slate` in the address (or removes it) without reloading. */
function setAddress(slate: string | null): void {
  const url = new URL(location.href);
  if (slate === null) url.searchParams.delete('slate');
  else url.searchParams.set('slate', slate);
  history.replaceState(null, '', url.toString());
}

/**
 * The main slate used to be saved in a fixed slot: move it to a slot of its own (so it is listed
 * under Slates), if it has anything in it.
 */
export function migrateMainSlate(storage: WritableStorage): void {
  let doc: unknown;
  try {
    doc = JSON.parse(storage.getItem(MAIN_KEY) ?? 'null');
  } catch {
    doc = null;
  }
  if (isDoc(doc) && doc.rows.some((r) => r.latex.trim() !== '')) {
    const key = keyOf(newId());
    storage.setItem(key, JSON.stringify(doc));
    storage.setItem(updatedKey(key), storage.getItem(updatedKey(MAIN_KEY)) ?? String(Date.now()));
  }
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k === MAIN_KEY || k?.startsWith(`${MAIN_KEY}.`)) doomed.push(k);
  }
  for (const k of doomed) storage.removeItem(k);
}

/** Whether this browser has any saved slate. */
function hasSavedSlates(storage: WritableStorage): boolean {
  for (let i = 0; i < storage.length; i++) {
    if (storage.key(i)?.startsWith(SLOT_PREFIX)) return true;
  }
  return false;
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

/**
 * The slate this tab opens with: the saved slate in the address, else a main slate — the
 * documentation on a first visit (nothing saved yet), otherwise an empty one.
 */
export function loadDoc(): Doc {
  try {
    migrateMainSlate(localStorage);
    const { slate } = saveState.get();
    if (slate !== null) {
      const parsed: unknown = JSON.parse(localStorage.getItem(keyOf(slate)) ?? 'null');
      if (isDoc(parsed)) return parsed;
      // Deleted (or never saved): this tab shows the main slate instead.
      saveState.set({ slate: null, edited: false });
      setAddress(null);
    }
    return hasSavedSlates(localStorage) ? emptyDoc() : documentationDoc();
  } catch {
    // Storage unavailable or corrupt.
    return documentationDoc();
  }
}

function write(slate: string, doc: Doc): boolean {
  try {
    localStorage.setItem(keyOf(slate), JSON.stringify(doc));
    localStorage.setItem(updatedKey(keyOf(slate)), String(Date.now()));
    return true;
  } catch {
    return false; // quota exceeded or storage disabled
  }
}

/**
 * Saves the slate in this tab: the main slate gets a slot of its own (and its address), a saved
 * one is written now. Returns false if storage refused.
 */
export function saveSlate(doc: Doc): boolean {
  const slate = saveState.get().slate ?? newId();
  if (!write(slate, doc)) return false;
  if (saveState.get().slate !== slate) setAddress(slate);
  saveState.set({ slate, edited: false });
  return true;
}

/**
 * Shows `doc` in this tab as a new, unsaved main slate. A saved slate that was open stays saved
 * as it was.
 */
export function openUnsaved(store: Store<Doc>, doc: Doc): void {
  const { slate } = saveState.get();
  if (slate !== null) {
    write(slate, store.get()); // its last edits, if autosave has not written them yet
    setAddress(null);
  }
  saveState.set({ slate: null, edited: false });
  store.set(doc);
  saveState.set({ slate: null, edited: false });
}

/**
 * Opens `doc` in a new tab, as an unsaved main slate (the document travels in the address, as
 * with Share). Returns false if pop-ups are blocked.
 */
export function openInNewTab(hash: string): boolean {
  const url = new URL(location.href);
  url.search = '';
  url.hash = hash;
  return window.open(url.toString(), '_blank') !== null;
}

/**
 * Saves a saved slate (debounced) whenever the store changes, and marks the main slate edited.
 * Leaving the page with an edited main slate asks first. Returns an unsubscribe function.
 */
export function autosave(store: Store<Doc>, delayMs = 300): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  const save = () => {
    const { slate } = saveState.get();
    if (!dirty || slate === null) return;
    dirty = false;
    write(slate, store.get());
  };
  const unsubscribe = store.subscribe(() => {
    if (saveState.get().slate === null) {
      if (!saveState.get().edited) saveState.set({ slate: null, edited: true });
      return;
    }
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(save, delayMs);
  });
  const beforeUnload = (e: BeforeUnloadEvent) => {
    clearTimeout(timer);
    save();
    const { slate, edited } = saveState.get();
    if (slate === null && edited && store.get().rows.some((r) => r.latex.trim() !== '')) {
      e.preventDefault(); // "Leave site? Changes you made may not be saved."
    }
  };
  window.addEventListener('beforeunload', beforeUnload);
  return () => {
    unsubscribe();
    window.removeEventListener('beforeunload', beforeUnload);
  };
}
