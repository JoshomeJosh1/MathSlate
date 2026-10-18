import type { InputRow, RowId } from '../../document/model';

/**
 * Where a dropped row goes, besides its position: into an existing folder, into a new folder
 * together with the row it was dropped on, or not into any folder (null).
 */
export type DropTarget = { folder: RowId } | { newFolderWith: RowId } | null;

/**
 * Where a dragged row lands when dropped next to `over`, from where the pointer is across `over`
 * (`x`, in the same coordinates as `rect`):
 * - over the right half of the row: into `over`'s folder (on a folder's title row: that
 *   folder); if `over` is in no folder, into a new folder with `over`;
 * - left of the row (in the indent of a folder's rows): no folder;
 * - in between, where the drag handle is: the dragged row keeps its folder if it is that one.
 * Folders never go into folders. `x` is undefined when dragging with the keyboard (keep).
 */
export function dropTarget(
  active: InputRow,
  over: InputRow,
  x: number | undefined,
  rect: { left: number; width: number },
): DropTarget {
  if (active.kind === 'folder') return null;
  const overFolder = over.kind === 'folder' ? over.id : (over.folder ?? null);
  const rightHalf = x !== undefined && x > rect.left + rect.width / 2;
  if (overFolder === null) {
    return rightHalf && over.id !== active.id ? { newFolderWith: over.id } : null;
  }
  if (rightHalf) return { folder: overFolder };
  if (x !== undefined && x < rect.left) return null;
  return active.folder === overFolder ? { folder: overFolder } : null;
}

/** Whether two drop targets are the same (for re-rendering only on change). */
export function sameTarget(a: DropTarget | undefined, b: DropTarget | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
