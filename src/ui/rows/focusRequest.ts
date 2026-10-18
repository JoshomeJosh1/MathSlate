import type { RowId } from '../../document/model';

/**
 * A row to focus once the row list has rendered it, for code outside the list (e.g. the header's
 * New folder button). The list takes the request after each render.
 */
let pending: RowId | null = null;

export function requestFocus(id: RowId): void {
  pending = id;
}

export function takeFocusRequest(): RowId | null {
  const id = pending;
  pending = null;
  return id;
}
