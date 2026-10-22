import type { Doc } from './model';
import { SLOT_PREFIX, isDoc, keyOf, saveState, updatedKey } from './persistence';

/**
 * The slates saved in this browser, one per Save of a main slate (persistence.ts). The Slates list shows them, opens them and deletes them.
 */

/** What a slate is called in the list: its first heading, folder title or row of math. */
export type SlateTitle = { kind: 'text'; text: string } | { kind: 'math'; latex: string } | null;

export interface SlateInfo {
  id: string;
  title: SlateTitle;
  /** When it was last edited (ms since 1970), if known. */
  updated: number | null;
  /** Rows with something in them. */
  rows: number;
  /** Open in this tab. */
  current: boolean;
}

/** Storage as far as the list needs it (localStorage, or a stand-in in tests). */
export type SlateStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'removeItem'>;

export function slateTitle(doc: Doc): SlateTitle {
  for (const row of doc.rows) {
    const text = row.latex.trim();
    if (text === '') continue;
    if (row.kind) return { kind: 'text', text: text.replace(/^#+\s*/, '').split('\n')[0] ?? text };
    return { kind: 'math', latex: text };
  }
  return null;
}

const contentRows = (doc: Doc) => doc.rows.filter((r) => r.latex.trim() !== '').length;

/**
 * Every saved slate, most recently edited first. Slates with nothing in them (a new tab that
 * was never used) are removed on the way, except the one open in this tab.
 */
export function listSlates(
  storage: SlateStorage,
  current: string | null = saveState.get().slate,
): SlateInfo[] {
  const ids: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    const id = key?.startsWith(SLOT_PREFIX) ? key.slice(SLOT_PREFIX.length) : null;
    // Only the slots themselves, not what is kept beside them (".updated", ".beforeLink").
    if (id && !id.includes('.')) ids.push(id);
  }
  const slates: SlateInfo[] = [];
  for (const id of ids) {
    const key = keyOf(id);
    let doc: unknown;
    try {
      doc = JSON.parse(storage.getItem(key) ?? 'null');
    } catch {
      doc = null;
    }
    if (!isDoc(doc)) continue;
    const rows = contentRows(doc);
    const isCurrent = id === current;
    if (rows === 0 && !isCurrent) {
      deleteSlate(storage, id);
      continue;
    }
    const updated = Number(storage.getItem(updatedKey(key)));
    slates.push({
      id,
      title: slateTitle(doc),
      updated: Number.isFinite(updated) && updated > 0 ? updated : null,
      rows,
      current: isCurrent,
    });
  }
  return slates.sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0));
}

/** Removes a saved slate and what is kept beside it. */
export function deleteSlate(storage: SlateStorage, id: string): void {
  const key = keyOf(id);
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k === key || k?.startsWith(`${key}.`)) doomed.push(k);
  }
  for (const k of doomed) storage.removeItem(k);
}

/** The address that opens a slate (relative to the app's own page). */
export function slateHref(id: string): string {
  return `./?slate=${encodeURIComponent(id)}`;
}
