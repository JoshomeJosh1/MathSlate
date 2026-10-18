import { describe, expect, it } from 'vitest';
import type { InputRow } from '../../document/model';
import { dropTarget } from './dropTarget';

const row = (id: string, extra: Partial<InputRow> = {}): InputRow => ({
  id,
  latex: id,
  outputs: [],
  ...extra,
});
const folder = row('F', { kind: 'folder' });
const member = row('m', { folder: 'F' });
const other = row('o', { folder: 'F' });
const top = row('t');
// A row in a folder is indented: its left edge is at 28.
const rect = { left: 28, width: 600 };

describe('where a dragged row lands', () => {
  it('joins the folder of the row when over its right half', () => {
    expect(dropTarget(top, other, 400, rect)).toBe('F');
    expect(dropTarget(top, folder, 400, { left: 0, width: 600 })).toBe('F');
  });

  it('leaves folders when the pointer is left of the row', () => {
    expect(dropTarget(member, other, 10, rect)).toBeNull();
  });

  it('keeps its folder in between (dragging by the row number)', () => {
    expect(dropTarget(member, other, 50, rect)).toBe('F');
    expect(dropTarget(top, other, 50, rect)).toBeNull();
    expect(dropTarget(member, other, undefined, rect)).toBe('F'); // keyboard
  });

  it('next to a top-level row there is no folder, and folders never nest', () => {
    expect(dropTarget(member, top, 400, { left: 0, width: 600 })).toBeNull();
    expect(dropTarget(folder, other, 400, rect)).toBeNull();
  });
});
