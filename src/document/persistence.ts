import { documentationDoc } from './documentation';
import type { Doc } from './model';
import type { Store } from './store';

const STORAGE_KEY = 'mathslate.doc.v1';

function isDoc(value: unknown): value is Doc {
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
  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store.get()));
    } catch {
      // Quota exceeded or storage disabled; nothing useful to do.
    }
  };
  const unsubscribe = store.subscribe(() => {
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
