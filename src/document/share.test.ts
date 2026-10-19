import { describe, expect, it } from 'vitest';
import { documentationDoc } from './documentation';
import { addOutput, emptyDoc, insertRowAfter } from './model';
import { docFromHash, shareHash } from './share';

describe('sharing by link', () => {
  it('round-trips a document through the hash, with short ids', () => {
    let doc = emptyDoc();
    const a = insertRowAfter(doc, null, 'x^2-1');
    doc = addOutput(a.doc, a.id, 'series', { at: 'x=1' });
    const hash = shareHash(doc);
    expect(hash.startsWith('#s=')).toBe(true);
    const back = docFromHash(hash);
    expect(back?.rows.map((r) => r.latex)).toEqual(doc.rows.map((r) => r.latex));
    expect(back?.rows.map((r) => r.id)).toEqual(['1', '2']);
    expect(back?.rows[1]?.outputs[0]).toMatchObject({ commandId: 'series', args: { at: 'x=1' } });
  });

  it('keeps folders pointing at their (renamed) title rows', () => {
    const doc = documentationDoc();
    const back = docFromHash(shareHash(doc));
    expect(back?.rows.length).toBe(doc.rows.length);
    const ids = new Set(back?.rows.map((r) => r.id));
    for (const r of back?.rows ?? []) if (r.folder) expect(ids.has(r.folder)).toBe(true);
  });

  it('ignores other hashes and damaged links', () => {
    expect(docFromHash('')).toBeNull();
    expect(docFromHash('#about')).toBeNull();
    expect(docFromHash('#s=not-a-document')).toBeNull();
  });
});
