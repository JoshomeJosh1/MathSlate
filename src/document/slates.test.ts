import { describe, expect, it } from 'vitest';
import { documentationDoc } from './documentation';
import { emptyDoc, insertRowAfter, type Doc } from './model';
import { MAIN_KEY, SLOT_PREFIX, updatedKey } from './persistence';
import { deleteSlate, listSlates, slateTitle } from './slates';

/** An in-memory Storage. */
function storage(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    keys: () => [...map.keys()],
  };
}

const withRow = (latex: string): Doc => insertRowAfter(emptyDoc(), null, latex).doc;

describe('slates saved in the browser', () => {
  it('lists them newest first, with titles, and removes unused empty ones', () => {
    const s = storage({
      [MAIN_KEY]: JSON.stringify(withRow('x^2')),
      [updatedKey(MAIN_KEY)]: '100',
      [SLOT_PREFIX + 'aa']: JSON.stringify(documentationDoc()),
      [updatedKey(SLOT_PREFIX + 'aa')]: '300',
      [SLOT_PREFIX + 'bb']: JSON.stringify(emptyDoc()),
      [SLOT_PREFIX + 'cc']: JSON.stringify(emptyDoc()),
      [SLOT_PREFIX + 'aa.beforeLink']: JSON.stringify(emptyDoc()),
    });
    const list = listSlates(s, 'cc');
    expect(list.map((x) => x.id)).toEqual(['aa', null, 'cc']);
    expect(list[0]?.title).toEqual({ kind: 'text', text: 'MathSlate' });
    expect(list[1]).toMatchObject({ title: { kind: 'math', latex: 'x^2' }, rows: 1, updated: 100 });
    expect(list[2]).toMatchObject({ current: true, title: null, rows: 0 });
    // bb was empty and not open: removed.
    expect(s.keys()).not.toContain(SLOT_PREFIX + 'bb');
  });

  it('deletes a slate with what is kept beside it', () => {
    const s = storage({
      [SLOT_PREFIX + 'aa']: JSON.stringify(withRow('y')),
      [updatedKey(SLOT_PREFIX + 'aa')]: '1',
      [SLOT_PREFIX + 'aab']: JSON.stringify(withRow('z')),
    });
    deleteSlate(s, 'aa');
    expect(s.keys()).toEqual([SLOT_PREFIX + 'aab']);
  });

  it('titles a slate by its first heading, folder or math', () => {
    expect(slateTitle(withRow('a+b'))).toEqual({ kind: 'math', latex: 'a+b' });
    expect(slateTitle(emptyDoc())).toBeNull();
  });
});
