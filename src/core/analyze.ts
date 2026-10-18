import { nameKey, type Statement } from '../parser/ast';
import type { Cst } from '../parser/cst';
import {
  definitionShape,
  settleHeads,
  type DefinitionHead,
  type DefinitionShape,
} from '../parser/definitions';
import { MathError } from '../parser/errors';
import { parseLatex } from '../parser/parser';
import { resolveRow, type ResolveOptions } from '../parser/resolve';
import { meaningOf } from '../registries/interpretations';
import { SymbolTable, type SymbolInfo } from '../parser/symbols';
import { createBuiltinScope } from './builtinScope';

/**
 * Document-level static analysis: parse every row, find definitions, build the symbol table,
 * resolve every row against it. Pure and synchronous; the engine calls it on each edit.
 */

export interface RowInput {
  id: string;
  latex: string;
}

export interface RowAnalysis {
  id: string;
  latex: string;
  cst: Cst | null;
  /** Null when the row has an error. */
  statement: Statement | null;
  error: MathError | null;
  /** Symbol key this row defines (a sequence's base cases define the same key as its rule). */
  defines: string | null;
  /** User symbol keys this row reads. */
  refs: string[];
  /** Symbol interpretations this row relied on: symbol → option id. */
  interpretations: Map<string, string>;
}

export interface AnalyzeOptions {
  /** The document's interpretation choices: symbol → option id (missing = registry default). */
  interpretationChoices?: Readonly<Record<string, string>>;
}

const builtinScope = createBuiltinScope();

export function analyzeRows(
  rows: readonly RowInput[],
  { interpretationChoices = {} }: AnalyzeOptions = {},
): RowAnalysis[] {
  const options: ResolveOptions = {
    interpret: (symbol, form) => {
      const found = meaningOf(symbol, form, interpretationChoices);
      return found && { meaning: found.meaning, optionId: found.option.id };
    },
  };

  // 1. Parse.
  const parsed = rows.map((row) => {
    try {
      return { row, cst: parseLatex(row.latex), error: null };
    } catch (e) {
      if (e instanceof MathError) return { row, cst: null, error: e };
      throw e;
    }
  });

  // 2. Definition heads (shape only), settled across rows.
  const shapes = parsed.map((p) => (p.error ? null : definitionShape(p.cst)));
  const heads = settleHeads(shapes.map((s) => s?.head ?? null));
  const settledShapes: (DefinitionShape | null)[] = shapes.map((s, i) => {
    const head = heads[i];
    return s && head ? { head, rhs: s.rhs } : null;
  });

  // 3. Duplicate definitions are errors on every row involved.
  const duplicateErrors = findDuplicates(heads);

  // 4. Symbol table; a constant whose body refers to itself (x = x + 1) is an equation instead.
  let excluded = new Set<number>();
  for (let attempt = 0; attempt < 2; attempt++) {
    const table = buildTable(heads, rows, duplicateErrors, excluded);
    const results = parsed.map((p, i): RowAnalysis => {
      const shape = excluded.has(i) ? null : (settledShapes[i] ?? null);
      const base = { id: p.row.id, latex: p.row.latex, cst: p.cst };
      const dup = duplicateErrors.get(i);
      const error = p.error ?? dup ?? null;
      if (error) {
        return {
          ...base,
          statement: null,
          error,
          defines: null,
          refs: [],
          interpretations: new Map(),
        };
      }
      try {
        const r = resolveRow(p.cst, shape, table, options);
        const head = shape?.head;
        return {
          ...base,
          statement: r.statement,
          error: null,
          defines: head ? nameKey(head.name) : null,
          refs: [...r.refs],
          interpretations: r.interpretations,
        };
      } catch (e) {
        if (!(e instanceof MathError)) throw e;
        return {
          ...base,
          statement: null,
          error: e,
          defines: shape ? nameKey(shape.head.name) : null,
          refs: [],
          interpretations: new Map(),
        };
      }
    });
    const selfReferencing = new Set(
      results.flatMap((r, i) =>
        r.statement?.kind === 'defConst' && r.refs.includes(r.defines ?? '') ? [i] : [],
      ),
    );
    if (selfReferencing.size === 0) return results;
    excluded = new Set([...excluded, ...selfReferencing]);
  }
  throw new Error('analyzeRows: did not converge');
}

function buildTable(
  heads: (DefinitionHead | null)[],
  rows: readonly RowInput[],
  duplicateErrors: Map<number, MathError>,
  excluded: Set<number>,
): SymbolTable {
  const entries: SymbolInfo[] = [];
  heads.forEach((head, i) => {
    if (!head || duplicateErrors.has(i) || excluded.has(i)) return;
    const definedBy = rows[i]?.id ?? '';
    const key = nameKey(head.name);
    switch (head.kind) {
      case 'const':
        entries.push({ key, kind: 'variable', definedBy });
        break;
      case 'func':
        entries.push({
          key,
          kind: 'function',
          definedBy,
          arity: [head.params.length, head.params.length],
        });
        break;
      case 'seq':
        entries.push({ key, kind: 'sequence', definedBy });
        break;
      case 'seqBase':
        break; // the rule row defines the sequence symbol
    }
  });
  return new SymbolTable(entries, builtinScope);
}

function findDuplicates(heads: (DefinitionHead | null)[]): Map<number, MathError> {
  const byKey = new Map<string, number[]>();
  heads.forEach((head, i) => {
    if (!head) return;
    const key =
      head.kind === 'seqBase' ? `${nameKey(head.name)}#${head.index}` : nameKey(head.name);
    byKey.set(key, [...(byKey.get(key) ?? []), i]);
  });
  const errors = new Map<number, MathError>();
  for (const [key, indices] of byKey) {
    if (indices.length < 2) continue;
    for (const i of indices) {
      const head = heads[i];
      if (!head) continue;
      const what = key.includes('#') ? `${key.replace('#', '_')} is` : `"${key}" is`;
      errors.set(i, new MathError(`${what} defined on more than one line`, head.nameSpan));
    }
  }
  return errors;
}
