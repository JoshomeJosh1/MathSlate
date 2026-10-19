import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { docStore } from './docStore';
import type { Doc } from './model';
import { hasSavedDoc, isDoc } from './persistence';
import { createStore } from './store';

/**
 * Sharing a slate by link: the whole document, compressed into the URL's hash (`#s=…`). Nothing
 * is uploaded; the link is the document.
 */

const PREFIX = '#s=';

/** The document with short row and output ids (1, 2, …), so links stay short. */
function compact(doc: Doc): Doc {
  const ids = new Map(doc.rows.map((r, i) => [r.id, String(i + 1)]));
  return {
    ...doc,
    rows: doc.rows.map((r) => {
      const row = { ...r, id: ids.get(r.id) ?? r.id };
      row.outputs = r.outputs.map((o, k) => ({ ...o, id: `${row.id}.${k + 1}` }));
      if (r.folder !== undefined) row.folder = ids.get(r.folder) ?? r.folder;
      return row;
    }),
  };
}

/** The hash (`#s=…`) that opens this document. */
export function shareHash(doc: Doc): string {
  return PREFIX + compressToEncodedURIComponent(JSON.stringify(compact(doc)));
}

/** A link to this document (the current page with its hash). */
export function shareLink(doc: Doc): string {
  return `${location.origin}${location.pathname}${location.search}${shareHash(doc)}`;
}

/**
 * After opening a shared link: the slate that was open before, which the banner offers to
 * restore. Null once restored or dismissed (or when there was nothing of the user's to keep).
 * Kept in localStorage until then, so a reload does not lose it.
 */
const PREVIOUS_KEY = 'mathslate.doc.beforeLink';

function loadPrevious(): Doc | null {
  try {
    const raw = localStorage.getItem(PREVIOUS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isDoc(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const replacedByLink = createStore<Doc | null>(loadPrevious());

replacedByLink.subscribe(() => {
  try {
    const previous = replacedByLink.get();
    if (previous) localStorage.setItem(PREVIOUS_KEY, JSON.stringify(previous));
    else localStorage.removeItem(PREVIOUS_KEY);
  } catch {
    // Kept for this visit only.
  }
});

/**
 * Opens the document in the page's hash, if any (on load, and when a link is pasted into an open
 * tab). The hash is then removed so a reload does not open it again over later edits.
 */
export function openSharedLink(): void {
  const shared = docFromHash(location.hash);
  if (!shared) return;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  // Only the user's own saved slate is worth restoring (not the documentation of a first visit),
  // and a second link keeps the slate the first one replaced.
  if (!replacedByLink.get() && hasSavedDoc()) replacedByLink.set(docStore.get());
  docStore.set(shared);
}

/** The document a hash holds, or null if it holds none (or a damaged one). */
export function docFromHash(hash: string): Doc | null {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    const json = decompressFromEncodedURIComponent(hash.slice(PREFIX.length));
    const parsed: unknown = json ? JSON.parse(json) : null;
    return isDoc(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
