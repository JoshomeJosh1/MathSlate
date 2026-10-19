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

export type OutputRef = { kind: 'ans'; row: number } | { kind: 'out'; label: number };

/** The private symbol a reference is renamed to. */
export function refName(ref: OutputRef): Name {
  return ref.kind === 'ans'
    ? makeName('@ans', String(ref.row))
    : makeName('@out', String(ref.label));
}

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
    if (k.kind !== 'num' || !/^[0-9]+$/.test(k.value)) {
      throw new OutputRefError('out needs the number of an output: out_3');
    }
    return refer({ kind: 'out', label: Number(k.value) });
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
