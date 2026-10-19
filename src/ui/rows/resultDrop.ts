/**
 * Dragging a result (an output row) into the slate: it is copied into new input rows at the gap
 * nearest the pointer. Uses the browser's native drag and drop (separate from reordering rows),
 * so a result can also be dropped as text into other applications.
 */

/** The data type a dragged result carries: JSON, the LaTeX of each row it becomes. */
export const RESULT_ROWS_TYPE = 'application/x-mathslate-rows';

export interface RowBox {
  id: string;
  top: number;
  bottom: number;
}

export interface ResultDrop {
  /** The new rows go after this row; null: at the very start. */
  after: string | null;
  /** Where to draw the insertion line (viewport y). */
  y: number;
}

/**
 * The gap for a pointer at `y`: before the first row whose middle is below the pointer, else after
 * the last row. `rows` are the visible rows (each with its outputs), top to bottom.
 */
export function resultDrop(rows: readonly RowBox[], y: number): ResultDrop | null {
  let previous: RowBox | null = null;
  for (const row of rows) {
    if (y < (row.top + row.bottom) / 2) return { after: previous?.id ?? null, y: row.top };
    previous = row;
  }
  return previous ? { after: previous.id, y: previous.bottom } : null;
}
