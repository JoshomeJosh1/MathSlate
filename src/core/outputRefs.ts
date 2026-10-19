import { makeName, nameKey, type Definition, type Expr, type Name } from '../parser/ast';
import { ANS, OUT } from './builtinScope';
import { mapChildren } from './walk';

/**
 * References to results: `ans` (the nearest result above the row that uses it) and `out_k` (the
 * output labelled k). Rows refer to them by name; before a request is sent, each use is renamed
 * to a private symbol (`@ans_{row}`, `@out_{k}`: `ans` in a definition means the result above
 * that definition's row, not above the row using the definition), and the engine adds a
 * definition holding the result's value for each.
 */

/**
 * `outs`: out_k with an index that is not a number (\sum_{k=1}^{3} out_k): the results as a
 * sequence, `@out`, whose terms are the outputs' values by label.
 */
export type OutputRef =
  { kind: 'ans'; row: number } | { kind: 'out'; label: number } | { kind: 'outs' };

/** The private symbol a reference is renamed to. */
export function refName(ref: OutputRef): Name {
  switch (ref.kind) {
    case 'ans':
      return makeName('@ans', String(ref.row));
    case 'out':
      return makeName('@out', String(ref.label));
    case 'outs':
      return makeName(OUTS);
  }
}

/** The sequence of results (out_k for a symbolic k). */
const OUTS = '@out';

export class OutputRefError extends Error {}

/**
 * Renames the uses of `ans` and `out_k` in an expression from row `row` (unless the document
 * defines its own ans / out), collecting the references.
 */
export function renameOutputRefs(
  e: Expr,
  row: number,
  userDefined: ReadonlySet<string>,
  found: Map<string, OutputRef>,
): Expr {
  const refer = (ref: OutputRef): Expr => {
    const name = refName(ref);
    found.set(nameKey(name), ref);
    return { kind: 'var', name, span: e.span };
  };
  if (e.kind === 'var' && nameKey(e.name) === ANS && !userDefined.has(ANS)) {
    return refer({ kind: 'ans', row });
  }
  if (e.kind === 'index' && nameKey(e.seq) === OUT && !userDefined.has(OUT)) {
    const k = e.index;
    if (k.kind === 'num' && /^[0-9]+$/.test(k.value)) {
      return refer({ kind: 'out', label: Number(k.value) });
    }
    if (k.kind === 'num') throw new OutputRefError('Outputs are numbered 1, 2, 3, …: out_3');
    // out_k, out_{k+1}: a term of the results' sequence.
    const ref: OutputRef = { kind: 'outs' };
    found.set(nameKey(refName(ref)), ref);
    return {
      ...e,
      seq: refName(ref),
      index: renameOutputRefs(k, row, userDefined, found),
    };
  }
  return mapChildren(e, (c) => renameOutputRefs(c, row, userDefined, found));
}

/** Whether an expression uses ans or out_k (cheaply, before renaming). */
export function usesOutputRefs(e: Expr, userDefined: ReadonlySet<string>): boolean {
  let uses = false;
  const visit = (x: Expr): Expr => {
    if (x.kind === 'var' && nameKey(x.name) === ANS && !userDefined.has(ANS)) uses = true;
    if (x.kind === 'index' && nameKey(x.seq) === OUT && !userDefined.has(OUT)) uses = true;
    return uses ? x : mapChildren(x, visit);
  };
  visit(e);
  return uses;
}

/** A definition with its body's references renamed (`row` is the row that defines it). */
export function renameInDefinition(
  d: Definition,
  row: number,
  userDefined: ReadonlySet<string>,
  found: Map<string, OutputRef>,
): Definition {
  return { ...d, body: renameOutputRefs(d.body, row, userDefined, found) };
}

/** The definition that gives a reference its value. */
export function refDefinition(ref: OutputRef, value: Expr): Definition {
  return {
    kind: 'defConst',
    name: refName(ref),
    body: value,
    nameSpan: { start: 0, end: 0 },
  };
}

/** The definitions of the results' sequence: one term per output label with a value. */
export function outsDefinitions(values: ReadonlyMap<number, Expr>): Definition[] {
  return [...values].map(([label, body]) => ({
    kind: 'defSeqBase',
    name: makeName(OUTS),
    index: label,
    body,
    nameSpan: { start: 0, end: 0 },
  }));
}
