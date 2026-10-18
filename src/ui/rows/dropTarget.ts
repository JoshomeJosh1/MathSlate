import type { InputRow, RowId } from '../../document/model';

/**
 * Where a dropped row goes, besides its position: into an existing folder, into a new folder
 * together with the row it was dropped on, or not into any folder (null).
 */
export type DropTarget = { folder: RowId } | { newFolderWith: RowId } | null;

/**
 * How far across a top-level row or a folder's title row the pointer must be to join it (a new
 * folder with the row; the folder).
 */
export const JOIN_FROM = 1 / 3;

/**
 * Where a dragged row lands when dropped on `over`, from where the pointer is across `over`
 * (`x`, in the same coordinates as `rect`):
 * - on a row of a folder: into that folder right of the folder's indent line (the row's left
 *   edge, as the row is indented), out of folders left of it;
 * - on a folder's title row: into the folder past the first third of the row;
 * - on a row in no folder: past its first third, into a new folder with it.
 * Folders never go into folders. `x` is undefined when dragging with the keyboard: the row keeps
 * its folder if it is the one it is dropped in.
 */
export function dropTarget(
  active: InputRow,
  over: InputRow,
  x: number | undefined,
  rect: { left: number; width: number },
): DropTarget {
  if (active.kind === 'folder') return null;
  const overFolder = over.kind === 'folder' ? over.id : (over.folder ?? null);
  const pastThird = x !== undefined && x > rect.left + rect.width * JOIN_FROM;
  if (overFolder === null) {
    return pastThird && over.id !== active.id ? { newFolderWith: over.id } : null;
  }
  if (x === undefined) return active.folder === overFolder ? { folder: overFolder } : null;
  const joins = over.kind === 'folder' ? pastThird : x >= rect.left;
  return joins ? { folder: overFolder } : null;
}

/** Whether two drop targets are the same (for re-rendering only on change). */
export function sameTarget(a: DropTarget | undefined, b: DropTarget | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
