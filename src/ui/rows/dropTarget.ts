import type { InputRow, RowId } from '../../document/model';

/**
 * Which folder a dragged row joins when dropped next to `over`, from where the pointer is across
 * `over` (`x`, in the same coordinates as `rect`):
 * - over the right half of the row: `over`'s folder (on a folder's title row: that folder);
 * - left of the row (in the indent of a folder's rows): no folder;
 * - in between, where the drag handle is: the dragged row keeps its folder if it is that one.
 * Folders never go into folders. `x` is undefined when dragging with the keyboard (keep).
 */
export function dropTarget(
  active: InputRow,
  over: InputRow,
  x: number | undefined,
  rect: { left: number; width: number },
): RowId | null {
  if (active.kind === 'folder') return null;
  const overFolder = over.kind === 'folder' ? over.id : (over.folder ?? null);
  if (overFolder === null) return null;
  if (x !== undefined && x > rect.left + rect.width / 2) return overFolder;
  if (x !== undefined && x < rect.left) return null;
  return active.folder === overFolder ? overFolder : null;
}
