/**
 * Persisted document model. Pure data + pure update functions (no React), so it is easy to test
 * and to serialize. Output rows are derived from inputs at evaluation time; only the *requests*
 * for outputs (e.g. "show /factor under this row") are persisted, as OutputSpecs.
 */

export type RowId = string;

export interface OutputSpec {
  id: string;
  /** Stable, user-visible label (referenced as out_k in expressions). */
  label: number;
  /** Command id, or 'auto' for the row's automatic evaluation. */
  commandId: string;
}

export interface InputRow {
  id: RowId;
  latex: string;
  outputs: OutputSpec[];
}

export interface Doc {
  version: 1;
  rows: InputRow[];
  /** Symbol interpretation choices, e.g. { i: 'imaginary-unit' }. */
  interpretations: Record<string, string>;
  nextOutputLabel: number;
}

export function newId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function newRow(latex = ''): InputRow {
  return { id: newId(), latex, outputs: [] };
}

export function emptyDoc(): Doc {
  return { version: 1, rows: [newRow()], interpretations: {}, nextOutputLabel: 1 };
}

export function indexOfRow(doc: Doc, id: RowId): number {
  return doc.rows.findIndex((r) => r.id === id);
}

/** Inserts a new row after `afterId` (or at the end if not found). Returns the new row's id. */
export function insertRowAfter(
  doc: Doc,
  afterId: RowId | null,
  latex = '',
): { doc: Doc; id: RowId } {
  const row = newRow(latex);
  const at = afterId === null ? -1 : indexOfRow(doc, afterId);
  const rows = [...doc.rows];
  rows.splice(at === -1 ? rows.length : at + 1, 0, row);
  return { doc: { ...doc, rows }, id: row.id };
}

/** Removes a row. The document always keeps at least one (empty) row. */
export function deleteRow(doc: Doc, id: RowId): Doc {
  const rows = doc.rows.filter((r) => r.id !== id);
  return { ...doc, rows: rows.length > 0 ? rows : [newRow()] };
}

export function updateLatex(doc: Doc, id: RowId, latex: string): Doc {
  return { ...doc, rows: doc.rows.map((r) => (r.id === id ? { ...r, latex } : r)) };
}

/** Moves the row `id` to the position currently occupied by `overId`. */
export function moveRow(doc: Doc, id: RowId, overId: RowId): Doc {
  const from = indexOfRow(doc, id);
  const to = indexOfRow(doc, overId);
  if (from === -1 || to === -1 || from === to) return doc;
  const rows = [...doc.rows];
  const [row] = rows.splice(from, 1);
  if (row) rows.splice(to, 0, row);
  return { ...doc, rows };
}
