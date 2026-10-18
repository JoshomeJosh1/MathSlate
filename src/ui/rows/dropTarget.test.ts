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
// A row in a folder is indented: its left edge (the indent line) is at 28.
const rect = { left: 28, width: 600 };
const flat = { left: 0, width: 600 };

describe('where a dragged row lands', () => {
  it('on a row of a folder: in the folder right of the indent line, out of it left of it', () => {
    expect(dropTarget(top, other, 40, rect)).toEqual({ folder: 'F' });
    expect(dropTarget(top, other, 400, rect)).toEqual({ folder: 'F' });
    expect(dropTarget(member, other, 40, rect)).toEqual({ folder: 'F' });
    expect(dropTarget(member, other, 10, rect)).toBeNull();
  });

  it('on a folder title: in the folder past the first third', () => {
    expect(dropTarget(top, folder, 250, flat)).toEqual({ folder: 'F' });
    expect(dropTarget(top, folder, 40, flat)).toBeNull();
    expect(dropTarget(member, folder, 40, flat)).toBeNull();
  });

  it('on a top-level row: past its first third, a new folder with it', () => {
    expect(dropTarget(top, top2, 250, flat)).toEqual({ newFolderWith: 'u' });
    expect(dropTarget(member, top2, 250, flat)).toEqual({ newFolderWith: 'u' });
    expect(dropTarget(top, top2, 150, flat)).toBeNull();
    expect(dropTarget(top, top, 400, flat)).toBeNull(); // on itself
  });

  it('with the keyboard, a row keeps its folder', () => {
    expect(dropTarget(member, other, undefined, rect)).toEqual({ folder: 'F' });
    expect(dropTarget(top, other, undefined, rect)).toBeNull();
  });

  it('folders never nest', () => {
    expect(dropTarget(folder, other, 400, rect)).toBeNull();
    expect(dropTarget(folder, top, 400, flat)).toBeNull();
  });
});
