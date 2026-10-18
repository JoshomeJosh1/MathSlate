import { deleteRow, insertRowAfter, moveRow, updateLatex, type RowId } from './model';
import { loadDoc } from './persistence';
import { createStore } from './store';

/** The app's single open document. */
export const docStore = createStore(loadDoc());

/** Store-bound wrappers around the pure model functions. */
export const docActions = {
  insertRowAfter(afterId: RowId | null, latex = ''): RowId {
    let id = '';
    docStore.set((doc) => {
      const result = insertRowAfter(doc, afterId, latex);
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
};
