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

/** A row that is not math: notes (plain text) and folders. Neither is evaluated. */
export type RowKind = 'note' | 'folder';

export interface InputRow {
  id: RowId;
  /**
   * 'note' rows hold plain text (headings, explanations). 'folder' rows are a folder's title;
   * the folder's rows follow it directly. Absent: a math row.
   */
  kind?: RowKind;
  /** LaTeX for math rows; plain text for notes; the title for folders. */
  latex: string;
  outputs: OutputSpec[];
  /**
   * The folder this row is in (one level: folders are never inside folders). A folder's rows
   * always sit directly after its title row; `normalizeFolders` enforces this.
   */
  folder?: RowId;
  /** Folders only: rows hidden (they still compute). */
  collapsed?: boolean;
}

export interface Doc {
  version: 1;
  rows: InputRow[];
  /** Symbol interpretation choices, e.g. { i: 'imaginary-unit' }. */
  interpretations: Record<string, string>;
  nextOutputLabel: number;
  /** Preferred CAS backend id ('sympy', 'nerdamer'); absent = automatic (SymPy first). */
  preferredBackend?: string;
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

// ------------------------------------------------------------------------------- folders

/** The rows of folder `folderId` (in order), not including its title row. */
export function folderMembers(rows: readonly InputRow[], folderId: RowId): InputRow[] {
  return rows.filter((r) => r.folder === folderId);
}

/** The index just past folder `folderId`'s last row (its title row's index + 1 if empty). */
function blockEnd(rows: readonly InputRow[], folderId: RowId): number {
  let end = rows.findIndex((r) => r.id === folderId) + 1;
  while (end > 0 && rows[end]?.folder === folderId) end++;
  return end;
}

/**
 * Restores the folder invariants: a row is in a folder only if it sits directly after that
 * folder's title row or another of its rows (otherwise it leaves the folder), and folders are
 * never inside folders. Every update below ends with this, so they need not be careful.
 */
export function normalizeFolders(rows: readonly InputRow[]): InputRow[] {
  const out: InputRow[] = [];
  for (const row of rows) {
    const prev = out[out.length - 1];
    const fits =
      row.folder !== undefined &&
      row.kind !== 'folder' &&
      prev !== undefined &&
      ((prev.kind === 'folder' && prev.id === row.folder) || prev.folder === row.folder);
    if (row.folder !== undefined && !fits) {
      out.push(omit(row, 'folder'));
    } else {
      out.push(row);
    }
  }
  return out;
}

/** The folder a new row placed directly after `prev` belongs to (as if typed there). */
function folderAfter(prev: InputRow | undefined): RowId | undefined {
  if (!prev) return undefined;
  if (prev.kind === 'folder') return prev.collapsed ? undefined : prev.id;
  return prev.folder;
}

/**
 * Inserts a new row after `afterId` (or at the end, outside folders, if null/not found), in the
 * same folder as the row it follows: after a folder's title row it becomes the folder's first row, unless the
 * folder is collapsed (then it goes after the folder). A new folder never goes inside a folder.
 */
export function insertRowAfter(
  doc: Doc,
  afterId: RowId | null,
  latex = '',
  kind?: RowKind,
): { doc: Doc; id: RowId } {
  const row: InputRow = kind ? { ...newRow(latex), kind } : newRow(latex);
  const rows = [...doc.rows];
  const found = afterId === null ? -1 : indexOfRow(doc, afterId);
  let at = found === -1 ? rows.length : found + 1;
  const prev = rows[at - 1];
  // At the end of the slate (no row to follow): outside any folder.
  const folder = found === -1 ? undefined : folderAfter(prev);
  if (prev?.kind === 'folder' && prev.collapsed) at = blockEnd(rows, prev.id);
  if (kind === 'folder') {
    // Not inside a folder: after the folder the previous row is in.
    if (folder !== undefined) at = blockEnd(rows, folder);
  } else if (folder !== undefined) {
    row.folder = folder;
  }
  rows.splice(at, 0, row);
  return { doc: { ...doc, rows: normalizeFolders(rows) }, id: row.id };
}

/**
 * Removes a row. Removing a folder keeps its rows (they leave the folder). The document always
 * keeps at least one (empty) row.
 */
export function deleteRow(doc: Doc, id: RowId): Doc {
  const rows = doc.rows
    .filter((r) => r.id !== id)
    .map((r) => (r.folder === id ? omit(r, 'folder') : r));
  return { ...doc, rows: rows.length > 0 ? normalizeFolders(rows) : [newRow()] };
}

export function updateLatex(doc: Doc, id: RowId, latex: string): Doc {
  return { ...doc, rows: doc.rows.map((r) => (r.id === id ? { ...r, latex } : r)) };
}

/**
 * Turns a row into a math row, a note or a folder (keeping its text). A row inside a folder that
 * becomes a folder starts a new folder there: the rows after it in the old folder move into it.
 * A folder that becomes something else lets its rows go.
 */
export function setRowKind(doc: Doc, id: RowId, kind: RowKind | 'math'): Doc {
  const index = indexOfRow(doc, id);
  const row = doc.rows[index];
  if (!row) return doc;
  const oldFolder = row.folder;
  const rows = doc.rows.map((r, i) => {
    if (r.id === id) {
      const next: InputRow = { id: r.id, latex: r.latex, outputs: r.outputs };
      if (kind !== 'math') next.kind = kind;
      if (kind !== 'folder' && r.folder !== undefined) next.folder = r.folder;
      return next;
    }
    if (kind === 'folder' && oldFolder !== undefined && i > index && r.folder === oldFolder) {
      return { ...r, folder: id };
    }
    if (row.kind === 'folder' && kind !== 'folder' && r.folder === id) return omit(r, 'folder');
    return r;
  });
  return { ...doc, rows: normalizeFolders(rows) };
}

/** Collapses or expands a folder. */
export function setCollapsed(doc: Doc, id: RowId, collapsed: boolean): Doc {
  return {
    ...doc,
    rows: doc.rows.map((r) => {
      if (r.id !== id || r.kind !== 'folder') return r;
      return collapsed ? { ...r, collapsed: true } : omit(r, 'collapsed');
    }),
  };
}

/**
 * Puts rows into a new folder (titled `title`), in document order, where the first of them was
 * (after its folder, if it was in one). Folders among `ids` are ignored. Returns the folder's id.
 */
export function groupRows(
  doc: Doc,
  ids: readonly RowId[],
  title = '',
): { doc: Doc; id: RowId | null } {
  const chosen = new Set(ids);
  const picked = doc.rows.filter((r) => chosen.has(r.id) && r.kind !== 'folder');
  const first = picked[0];
  if (!first) return { doc, id: null };
  const folder: InputRow = { ...newRow(title), kind: 'folder' };
  const pickedIds = new Set(picked.map((r) => r.id));
  const rest = doc.rows.filter((r) => !pickedIds.has(r.id));
  // Where the first picked row was, in the remaining rows; outside any folder.
  const firstIndex = indexOfRow(doc, first.id);
  let at = doc.rows.slice(0, firstIndex).filter((r) => !pickedIds.has(r.id)).length;
  const before = rest[at - 1];
  const inside = folderAfter(before);
  if (inside !== undefined && rest[at]?.folder === inside) at = blockEnd(rest, inside);
  else if (before?.kind === 'folder') at = blockEnd(rest, before.id);
  rest.splice(at, 0, folder, ...picked.map((r) => ({ ...r, folder: folder.id })));
  return { doc: { ...doc, rows: normalizeFolders(rest) }, id: folder.id };
}

/**
 * Moves row `id` to where `overId` is (above it when moving up, below it when moving down, as in
 * a sortable list) and into folder `into` (or out of folders, for null). A folder moves with all
 * its rows and never goes inside a folder. Dropping onto a folder's title row with `into` set to
 * that folder makes the row its first one; moving into a collapsed folder expands it.
 */
export function moveRow(doc: Doc, id: RowId, overId: RowId, into: RowId | null = null): Doc {
  const from = indexOfRow(doc, id);
  const to = indexOfRow(doc, overId);
  const row = doc.rows[from];
  const over = doc.rows[to];
  if (!row || !over) return doc;
  const isFolder = row.kind === 'folder';
  const target = isFolder ? null : into;
  const block = new Set(isFolder ? [id, ...folderMembers(doc.rows, id).map((r) => r.id)] : [id]);
  if (block.has(overId)) {
    // Dropped on itself: only its folder can change, and only where that keeps folders whole.
    if (isFolder || target === (row.folder ?? null)) return doc;
    return { ...doc, rows: normalizeFolders(doc.rows.map((r) => withFolder(r, id, target))) };
  }
  const moving = doc.rows.filter((r) => block.has(r.id));
  const rest = doc.rows.filter((r) => !block.has(r.id));
  const overAt = rest.findIndex((r) => r.id === overId);
  let at = from < to ? overAt + 1 : overAt;
  if (target !== null) {
    // Inside folder `target`: on its title row → first; otherwise within its rows.
    const head = rest.findIndex((r) => r.id === target);
    at = over.id === target ? head + 1 : Math.min(Math.max(at, head + 1), blockEnd(rest, target));
  } else {
    // Not inside a folder: if the spot is within one, go to its nearer end.
    const prev = rest[at - 1];
    const inside = folderAfter(prev) ?? (prev?.kind === 'folder' ? prev.id : undefined);
    if (inside !== undefined && (rest[at]?.folder === inside || prev?.id === inside)) {
      at = from < to ? blockEnd(rest, inside) : rest.findIndex((r) => r.id === inside);
    }
  }
  const placed = moving.map((r) => (r.id === id ? withFolder(r, id, target) : r));
  rest.splice(at, 0, ...placed);
  const rows = rest.map((r) => (r.id === target && r.collapsed ? expanded(r) : r));
  return { ...doc, rows: normalizeFolders(rows) };
}

function withFolder(row: InputRow, id: RowId, folder: RowId | null): InputRow {
  if (row.id !== id) return row;
  return folder !== null ? { ...row, folder } : omit(row, 'folder');
}

function expanded(row: InputRow): InputRow {
  return omit(row, 'collapsed');
}

/** A copy of `row` without an optional field. */
function omit(row: InputRow, key: 'folder' | 'collapsed'): InputRow {
  const copy = { ...row };
  if (key === 'folder') delete copy.folder;
  else delete copy.collapsed;
  return copy;
}

/** Attaches a command's output row to an input row, with the next stable out_k label. */
export function addOutput(doc: Doc, rowId: RowId, commandId: string): Doc {
  const spec: OutputSpec = { id: newId(), label: doc.nextOutputLabel, commandId };
  return {
    ...doc,
    nextOutputLabel: doc.nextOutputLabel + 1,
    rows: doc.rows.map((r) => (r.id === rowId ? { ...r, outputs: [...r.outputs, spec] } : r)),
  };
}

export function removeOutput(doc: Doc, rowId: RowId, outputId: string): Doc {
  return {
    ...doc,
    rows: doc.rows.map((r) =>
      r.id === rowId ? { ...r, outputs: r.outputs.filter((o) => o.id !== outputId) } : r,
    ),
  };
}
