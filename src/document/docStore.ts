import {
  addOutput,
  deleteRow,
  groupRows,
  groupWith,
  insertRowAfter,
  moveRow,
  removeOutput,
  setCollapsed,
  setOutputArgs,
  setRowKind,
  updateLatex,
  type Doc,
  type RowId,
  type RowKind,
} from './model';
import { loadDoc } from './persistence';
import { createStore } from './store';

/** The app's single open document. */
export const docStore = createStore(loadDoc());

/** Store-bound wrappers around the pure model functions. */
export const docActions = {
  insertRowAfter(afterId: RowId | null, latex = '', kind?: RowKind): RowId {
    let id = '';
    docStore.set((doc) => {
      const result = insertRowAfter(doc, afterId, latex, kind);
      id = result.id;
      return result.doc;
    });
    return id;
  },
  /** A new folder at the end of the slate, with an empty math row in it. Returns its id. */
  addFolder(): RowId {
    const id = docActions.insertRowAfter(null, '', 'folder');
    docActions.insertRowAfter(id);
    return id;
  },
  deleteRow(id: RowId) {
    docStore.set((doc) => deleteRow(doc, id));
  },
  updateLatex(id: RowId, latex: string) {
    docStore.set((doc) => updateLatex(doc, id, latex));
  },
  moveRow(id: RowId, overId: RowId, into: RowId | null) {
    docStore.set((doc) => moveRow(doc, id, overId, into));
  },
  /** Drops row `id` on top-level row `targetId`: a new folder with both. Returns its id. */
  groupWith(targetId: RowId, id: RowId): RowId | null {
    let folder: RowId | null = null;
    docStore.set((doc) => {
      const result = groupWith(doc, targetId, id);
      folder = result.id;
      return result.doc;
    });
    return folder;
  },
  groupRows(ids: readonly RowId[]): RowId | null {
    let id: RowId | null = null;
    docStore.set((doc) => {
      const result = groupRows(doc, ids);
      id = result.id;
      return result.doc;
    });
    return id;
  },
  setCollapsed(id: RowId, collapsed: boolean) {
    docStore.set((doc) => setCollapsed(doc, id, collapsed));
  },
  addOutput(rowId: RowId, commandId: string, args: Readonly<Record<string, string>> = {}) {
    docStore.set((doc) => addOutput(doc, rowId, commandId, args));
  },
  setOutputArgs(rowId: RowId, outputId: string, args: Readonly<Record<string, string>>) {
    docStore.set((doc) => setOutputArgs(doc, rowId, outputId, args));
  },
  removeOutput(rowId: RowId, outputId: string) {
    docStore.set((doc) => removeOutput(doc, rowId, outputId));
  },
  setRowKind(id: RowId, kind: RowKind | 'math') {
    docStore.set((doc) => setRowKind(doc, id, kind));
  },
  setPreferredBackend(id: string | null) {
    docStore.set((doc) => {
      const next = { ...doc };
      if (id) next.preferredBackend = id;
      else delete next.preferredBackend;
      return next;
    });
  },
  replace(doc: Doc) {
    docStore.set(doc);
  },
};
