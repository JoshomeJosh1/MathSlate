import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { docStore } from './docStore';
import { normalizeFolders, type Doc, type InputRow, type OutputSpec } from './model';
import { isDoc, openUnsaved, saveState } from './persistence';
import { createStore } from './store';

/**
 * Sharing a slate by link: the whole document in the URL's hash (`#s=…`). Nothing is uploaded;
 * the link is the document. To keep links short it is packed (below), deflated and written in
 * URL-safe base64.
 *
 * Packed form: `[rows, interpretations?, backend?]`, each row `[latex, flags?, outputs?]` with
 * flags 'n' note, 'f' folder, 'c' collapsed, 'i' in the folder above, and each output
 * `[commandId, label, args?]` (labels are kept: rows refer to out_3). Ids are made up again.
 */

const PREFIX = '#s=';

type PackedOutput = [string, number, Record<string, string>?];
type PackedRow = [string, string?, PackedOutput[]?];
type Packed = [PackedRow[], Record<string, string>?, string?];

/** Drops trailing undefined entries (the optional parts of a packed row). */
function trim<T extends unknown[]>(items: T): T {
  while (items.length > 1 && items.at(-1) === undefined) items.pop();
  return items;
}

function pack(doc: Doc): Packed {
  const rows = doc.rows.map((r): PackedRow => {
    const flags =
      (r.kind === 'note' ? 'n' : r.kind === 'folder' ? 'f' : '') +
      (r.collapsed ? 'c' : '') +
      (r.folder !== undefined ? 'i' : '');
    const outputs = r.outputs.map((o): PackedOutput =>
      trim([o.commandId, o.label, o.args] as PackedOutput),
    );
    return trim([r.latex, flags || undefined, outputs.length ? outputs : undefined] as PackedRow);
  });
  const interpretations = Object.keys(doc.interpretations).length ? doc.interpretations : undefined;
  return trim([rows, interpretations, doc.preferredBackend] as Packed);
}

const isStringRecord = (v: unknown): v is Record<string, string> =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  Object.values(v).every((x) => typeof x === 'string');

/** The document a packed value describes, or null if it is not one. */
function unpack(value: unknown): Doc | null {
  if (!Array.isArray(value) || !Array.isArray(value[0])) return null;
  const [packedRows, interpretations, backend] = (value as unknown[]).map((x) => x ?? undefined);
  let folder: string | undefined;
  let nextOutputLabel = 1;
  const rows: InputRow[] = [];
  for (const [i, packed] of (packedRows as unknown[]).entries()) {
    if (!Array.isArray(packed) || typeof packed[0] !== 'string') return null;
    // A gap in an array is null in JSON (["x", null, outputs]: no flags).
    const [latex, flags = '', packedOutputs = []] = (packed as unknown[]).map(
      (x) => x ?? undefined,
    );
    if (typeof flags !== 'string' || !Array.isArray(packedOutputs)) return null;
    const id = `r${i + 1}`;
    const outputs: OutputSpec[] = [];
    for (const [k, o] of (packedOutputs as unknown[]).entries()) {
      if (!Array.isArray(o) || typeof o[0] !== 'string' || typeof o[1] !== 'number') return null;
      const spec: OutputSpec = { id: `${id}.${k + 1}`, label: o[1], commandId: o[0] };
      if (o[2] !== undefined && o[2] !== null) {
        if (!isStringRecord(o[2])) return null;
        spec.args = o[2];
      }
      outputs.push(spec);
      nextOutputLabel = Math.max(nextOutputLabel, o[1] + 1);
    }
    const row: InputRow = { id, latex: latex as string, outputs };
    if (flags.includes('n')) row.kind = 'note';
    if (flags.includes('f')) {
      row.kind = 'folder';
      folder = id;
      if (flags.includes('c')) row.collapsed = true;
    } else if (flags.includes('i') && folder !== undefined) {
      row.folder = folder;
    }
    rows.push(row);
  }
  if (interpretations !== undefined && !isStringRecord(interpretations)) return null;
  const doc: Doc = {
    version: 1,
    rows: normalizeFolders(rows),
    interpretations: interpretations ?? {},
    nextOutputLabel,
  };
  if (typeof backend === 'string') doc.preferredBackend = backend;
  return isDoc(doc) ? doc : null;
}

/** URL-safe base64 (no padding) of bytes, and back. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** The hash (`#s=…`) that opens this document. */
export function shareHash(doc: Doc): string {
  return PREFIX + toBase64Url(deflateSync(strToU8(JSON.stringify(pack(doc))), { level: 9 }));
}

/** A link to this document (the current page with its hash). */
export function shareLink(doc: Doc): string {
  return `${location.origin}${location.pathname}${location.search}${shareHash(doc)}`;
}

/**
 * After a shared link replaced an edited, unsaved main slate: that slate, which the banner offers
 * to restore. Null once restored or dismissed (or when nothing unsaved was replaced).
 */
export const replacedByLink = createStore<Doc | null>(null);

/**
 * Opens the document in the page's hash, if any (on load, and when a link is pasted into an open
 * tab), as an unsaved main slate: a saved slate open in this tab stays as it was. The hash is
 * then removed so a reload does not open it again over later edits.
 */
export function openSharedLink(): void {
  const shared = docFromHash(location.hash);
  if (!shared) return;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  // A second link keeps the slate the first one replaced.
  const { slate, edited } = saveState.get();
  if (!replacedByLink.get() && slate === null && edited) replacedByLink.set(docStore.get());
  openUnsaved(docStore, shared);
}

/** The document a hash holds, or null if it holds none (or a damaged one). */
export function docFromHash(hash: string): Doc | null {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    const json = strFromU8(inflateSync(fromBase64Url(hash.slice(PREFIX.length))));
    return unpack(JSON.parse(json));
  } catch {
    return null;
  }
}
