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
const top2 = row('u');
// A row in a folder is indented: its left edge is at 28.
const rect = { left: 28, width: 600 };
const flat = { left: 0, width: 600 };

describe('where a dragged row lands', () => {
  it('joins the folder of the row when over its right half', () => {
    expect(dropTarget(top, other, 400, rect)).toEqual({ folder: 'F' });
    expect(dropTarget(top, folder, 400, flat)).toEqual({ folder: 'F' });
  });

  it('makes a new folder with a top-level row when over its right half', () => {
    expect(dropTarget(top, top2, 400, flat)).toEqual({ newFolderWith: 'u' });
    expect(dropTarget(member, top2, 400, flat)).toEqual({ newFolderWith: 'u' });
    expect(dropTarget(top, top, 400, flat)).toBeNull(); // on itself
    expect(dropTarget(top, top2, 100, flat)).toBeNull(); // left half
  });

  it('leaves folders when the pointer is left of the row', () => {
    expect(dropTarget(member, other, 10, rect)).toBeNull();
  });

  it('keeps its folder in between (dragging by the row number)', () => {
    expect(dropTarget(member, other, 50, rect)).toEqual({ folder: 'F' });
    expect(dropTarget(top, other, 50, rect)).toBeNull();
    expect(dropTarget(member, other, undefined, rect)).toEqual({ folder: 'F' }); // keyboard
  });

  it('folders never nest', () => {
    expect(dropTarget(folder, other, 400, rect)).toBeNull();
    expect(dropTarget(folder, top, 400, flat)).toBeNull();
  });
});
