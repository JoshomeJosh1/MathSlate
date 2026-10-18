import { describe, expect, it } from 'vitest';
import {
  deleteRow,
  groupRows,
  insertRowAfter,
  moveRow,
  normalizeFolders,
  setCollapsed,
  setRowKind,
  type Doc,
  type InputRow,
} from './model';

/**
 * Documents as text: "@F" is a folder titled F ("@F (collapsed)" if collapsed), "  b" (indented)
 * a row in the folder above it, anything else a top-level row. Row ids are their text.
 */
function doc(...lines: string[]): Doc {
  const rows: InputRow[] = [];
  let folder: string | undefined;
  for (const line of lines) {
    if (line.startsWith('@')) {
      const title = line.slice(1).replace(' (collapsed)', '');
      folder = title;
      const row: InputRow = { id: title, kind: 'folder', latex: title, outputs: [] };
      if (line.endsWith('(collapsed)')) row.collapsed = true;
      rows.push(row);
    } else if (line.startsWith('  ')) {
      const text = line.trim();
      rows.push({ id: text, latex: text, outputs: [], ...(folder ? { folder } : {}) });
    } else {
      folder = undefined;
      rows.push({ id: line, latex: line, outputs: [] });
    }
  }
  return { version: 1, rows, interpretations: {}, nextOutputLabel: 1 };
}

function show(d: Doc): string[] {
  return d.rows.map((r) =>
    r.kind === 'folder'
      ? `@${r.latex}${r.collapsed ? ' (collapsed)' : ''}`
      : `${r.folder ? '  ' : ''}${r.latex}`,
  );
}

describe('folders', () => {
  it('keeps a folder’s rows directly after it', () => {
    const rows = doc('@F', '  a', 'b').rows;
    // A row claiming to be in F but not next to it leaves the folder.
    const broken = [...rows, { id: 'c', latex: 'c', outputs: [], folder: 'F' }];
    expect(show({ ...doc(), rows: normalizeFolders(broken) })).toEqual(['@F', '  a', 'b', 'c']);
  });

  describe('inserting', () => {
    const add = (d: Doc, after: string | null, kind?: 'folder') =>
      show(insertRowAfter(d, after, 'new', kind).doc);

    it('puts a new row in the folder of the row it follows', () => {
      expect(add(doc('@F', '  a', '  b', 'c'), 'a')).toEqual(['@F', '  a', '  new', '  b', 'c']);
      expect(add(doc('@F', '  a', 'c'), 'c')).toEqual(['@F', '  a', 'c', 'new']);
    });

    it('after a folder title: first in the folder, or after it when collapsed', () => {
      expect(add(doc('@F', '  a'), 'F')).toEqual(['@F', '  new', '  a']);
      expect(add(doc('@F (collapsed)', '  a', 'b'), 'F')).toEqual([
        '@F (collapsed)',
        '  a',
        'new',
        'b',
      ]);
    });

    it('never puts a folder inside a folder', () => {
      expect(add(doc('@F', '  a', '  b', 'c'), 'a', 'folder')).toEqual([
        '@F',
        '  a',
        '  b',
        '@new',
        'c',
      ]);
    });
  });

  it('deleting a folder keeps its rows', () => {
    expect(show(deleteRow(doc('@F', '  a', '  b', 'c'), 'F'))).toEqual(['a', 'b', 'c']);
  });

  it('turning a row in a folder into a folder starts a new folder there', () => {
    const d = setRowKind(doc('@F', '  a', '  b', '  c', 'd'), 'b', 'folder');
    expect(show(d)).toEqual(['@F', '  a', '@b', '  c', 'd']);
    // …and a folder turned back into a row lets its rows go.
    expect(show(setRowKind(d, 'b', 'math'))).toEqual(['@F', '  a', 'b', 'c', 'd']);
  });

  it('collapses and expands', () => {
    const d = setCollapsed(doc('@F', '  a'), 'F', true);
    expect(show(d)).toEqual(['@F (collapsed)', '  a']);
    expect(show(setCollapsed(d, 'F', false))).toEqual(['@F', '  a']);
  });

  it('groups rows into a new folder where the first was', () => {
    const { doc: d } = groupRows(doc('a', 'b', 'c', 'd'), ['d', 'b']);
    expect(show(d).map((s) => (s.startsWith('@') ? '@' : s))).toEqual([
      'a',
      '@',
      '  b',
      '  d',
      'c',
    ]);
    // Rows from inside a folder: the new folder goes after that folder (no nesting).
    const { doc: e } = groupRows(doc('@F', '  a', '  b', 'c'), ['a', 'c']);
    expect(show(e).map((s) => (s.startsWith('@') && s !== '@F' ? '@' : s))).toEqual([
      '@F',
      '  b',
      '@',
      '  a',
      '  c',
    ]);
  });

  describe('moving', () => {
    const move = (d: Doc, id: string, over: string, into: string | null = null) =>
      show(moveRow(d, id, over, into));

    it('reorders like a sortable list (top level)', () => {
      expect(move(doc('a', 'b', 'c'), 'a', 'c')).toEqual(['b', 'c', 'a']);
      expect(move(doc('a', 'b', 'c'), 'c', 'a')).toEqual(['c', 'a', 'b']);
    });

    it('into a folder, next to one of its rows', () => {
      expect(move(doc('a', '@F', '  b', '  c'), 'a', 'b', 'F')).toEqual([
        '@F',
        '  b',
        '  a',
        '  c',
      ]);
      expect(move(doc('@F', '  b', '  c', 'a'), 'a', 'c', 'F')).toEqual([
        '@F',
        '  b',
        '  a',
        '  c',
      ]);
    });

    it('onto a folder title: first in the folder, expanding it', () => {
      expect(move(doc('@F (collapsed)', '  b', 'a'), 'a', 'F', 'F')).toEqual(['@F', '  a', '  b']);
    });

    it('out of a folder, to the nearer end of it', () => {
      // Moving down out of the middle of F: after the folder.
      expect(move(doc('a', '@F', '  b', '  c'), 'a', 'b')).toEqual(['@F', '  b', '  c', 'a']);
      // Moving up: before the folder.
      expect(move(doc('@F', '  b', '  c', 'a'), 'a', 'c')).toEqual(['a', '@F', '  b', '  c']);
      // A row of F dragged out stays where it is when that is already the folder's end.
      expect(move(doc('@F', '  b', '  c', 'd'), 'c', 'c')).toEqual(['@F', '  b', 'c', 'd']);
    });

    it('a folder moves with its rows and never into a folder', () => {
      expect(move(doc('@F', '  a', '  b', 'c'), 'F', 'c')).toEqual(['c', '@F', '  a', '  b']);
      expect(move(doc('c', '@F', '  a', '@G', '  b'), 'G', 'a', 'F')).toEqual([
        'c',
        '@G',
        '  b',
        '@F',
        '  a',
      ]);
    });
  });
});
