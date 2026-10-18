import { describe, expect, it } from 'vitest';
import { deleteRow, emptyDoc, insertRowAfter, moveRow, updateLatex, type Doc } from './model';

function docWith(...latex: string[]): Doc {
  let doc: Doc = { ...emptyDoc(), rows: [] };
  for (const l of latex) doc = insertRowAfter(doc, null, l).doc;
  return doc;
}
const latexOf = (doc: Doc) => doc.rows.map((r) => r.latex);

describe('document model', () => {
  it('starts with one empty row', () => {
    expect(latexOf(emptyDoc())).toEqual(['']);
  });

  it('inserts after a given row', () => {
    const doc = docWith('a', 'c');
    const first = doc.rows[0];
    if (!first) throw new Error('missing row');
    const { doc: next, id } = insertRowAfter(doc, first.id, 'b');
    expect(latexOf(next)).toEqual(['a', 'b', 'c']);
    expect(next.rows[1]?.id).toBe(id);
  });

  it('never deletes the last row', () => {
    const doc = docWith('a');
    const next = deleteRow(doc, doc.rows[0]?.id ?? '');
    expect(latexOf(next)).toEqual(['']);
  });

  it('updates latex immutably', () => {
    const doc = docWith('a');
    const next = updateLatex(doc, doc.rows[0]?.id ?? '', 'x^2');
    expect(latexOf(next)).toEqual(['x^2']);
    expect(latexOf(doc)).toEqual(['a']);
  });

  it('moves rows up and down', () => {
    const doc = docWith('a', 'b', 'c');
    const [a, , c] = doc.rows;
    if (!a || !c) throw new Error('missing rows');
    expect(latexOf(moveRow(doc, a.id, c.id))).toEqual(['b', 'c', 'a']);
    expect(latexOf(moveRow(doc, c.id, a.id))).toEqual(['c', 'a', 'b']);
  });
});
