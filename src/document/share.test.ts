import { describe, expect, it } from 'vitest';
import { documentationDoc } from './documentation';
import { addOutput, emptyDoc, insertRowAfter, type Doc } from './model';
import { docFromHash, shareHash } from './share';

/** A document without its ids: what a link must keep. */
function content(doc: Doc) {
  const index = new Map(doc.rows.map((r, i) => [r.id, i]));
  return {
    rows: doc.rows.map((r) => ({
      latex: r.latex,
      kind: r.kind,
      collapsed: r.collapsed,
      folder: r.folder === undefined ? undefined : index.get(r.folder),
      outputs: r.outputs.map((o) => ({ commandId: o.commandId, label: o.label, args: o.args })),
    })),
    interpretations: doc.interpretations,
    preferredBackend: doc.preferredBackend,
    nextOutputLabel: doc.nextOutputLabel,
  };
}

describe('sharing by link', () => {
  it('round-trips a small document, in a short link', () => {
    let doc = emptyDoc();
    const a = insertRowAfter(doc, null, 'x^2-1');
    doc = addOutput(a.doc, a.id, 'series', { at: 'x=1' });
    doc = { ...doc, preferredBackend: 'nerdamer', interpretations: { e: 'variable' } };
    const hash = shareHash(doc);
    expect(hash.startsWith('#s=')).toBe(true);
    expect(hash.length).toBeLessThan(120);
    const back = docFromHash(hash);
    expect(back && content(back)).toEqual(content(doc));
  });

  it('round-trips the documentation: folders, collapsed folders, notes, outputs, labels', () => {
    const doc = documentationDoc();
    const back = docFromHash(shareHash(doc));
    expect(back && content(back)).toEqual(content(doc));
  });

  it('ignores other hashes and damaged links', () => {
    expect(docFromHash('')).toBeNull();
    expect(docFromHash('#about')).toBeNull();
    expect(docFromHash('#s=not-a-document')).toBeNull();
    expect(docFromHash(shareHash(emptyDoc()).slice(0, -4))).toBeNull();
  });
});
