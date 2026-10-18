import {
  addOutput,
  deleteRow,
  insertRowAfter,
  moveRow,
  removeOutput,
  setRowKind,
  updateLatex,
  type Doc,
  type RowId,
} from './model';
import { loadDoc } from './persistence';
import { createStore } from './store';

/** The app's single open document. */
export const docStore = createStore(loadDoc());

/** Store-bound wrappers around the pure model functions. */
export const docActions = {
  insertRowAfter(afterId: RowId | null, latex = '', kind?: 'note'): RowId {
    let id = '';
    docStore.set((doc) => {
      const result = insertRowAfter(doc, afterId, latex, kind);
      id = result.id;
      return result.doc;
    });
    return id;
  },
  deleteRow(id: RowId) {
    docStore.set((doc) => deleteRow(doc, id));
  },
  updateLatex(id: RowId, latex: string) {
    docStore.set((doc) => updateLatex(doc, id, latex));
  },
  moveRow(id: RowId, overId: RowId) {
    docStore.set((doc) => moveRow(doc, id, overId));
  },
  addOutput(rowId: RowId, commandId: string) {
    docStore.set((doc) => addOutput(doc, rowId, commandId));
  },
  removeOutput(rowId: RowId, outputId: string) {
    docStore.set((doc) => removeOutput(doc, rowId, outputId));
  },
  setRowKind(id: RowId, kind: 'note' | 'math') {
    docStore.set((doc) => setRowKind(doc, id, kind));
  },
  replace(doc: Doc) {
    docStore.set(doc);
  },
};
