import { nameKey, type Statement } from '../parser/ast';
import type { Cst } from '../parser/cst';
import {
  definitionShape,
  differentialSpans,
  settleHeads,
  type DefinitionHead,
  type DefinitionShape,
} from '../parser/definitions';
import { MathError } from '../parser/errors';
import { parseLatex } from '../parser/parser';
import {
  resolveRow,
  type NameOccurrence,
  type ResolveOptions,
  type Rewrite,
} from '../parser/resolve';
import { meaningOf } from '../registries/interpretations';
import { isUnitSymbol } from './units';
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
  /** Multi-letter names in the source and whether they are recognised (for upright display). */
  names: NameOccurrence[];
  /** Shorthand shown in its proper form once the row is left: [km], [1, 2; 3, 4] (decorate.ts). */
  rewrites: Rewrite[];
}

export interface AnalyzeOptions {
  /** The document's interpretation choices: symbol → option id (missing = registry default). */
  interpretationChoices?: Readonly<Record<string, string>>;
}

const builtinScope = createBuiltinScope();

/** A piece of LaTeX outside the rows (a command's argument), read in the document's context. */
export type SnippetResult =
  { ok: true; statement: Statement; refs: string[] } | { ok: false; error: string };

export interface DocumentAnalysis {
  rows: RowAnalysis[];
  /**
   * Reads LaTeX against the document's names (`a` in "series about x = a" is the row that
   * defines a). `locals` are names bound where the snippet is used (a function's parameters).
   */
  resolve: (latex: string, locals?: readonly string[]) => SnippetResult;
}

export function analyzeRows(
  rows: readonly RowInput[],
  options: AnalyzeOptions = {},
): RowAnalysis[] {
  return analyzeDocument(rows, options).rows;
}

export function analyzeDocument(
  rows: readonly RowInput[],
  options: AnalyzeOptions = {},
): DocumentAnalysis {
  const { rows: analyses, table, resolveOptions } = analyze(rows, options);
  const resolve = (latex: string, locals: readonly string[] = []): SnippetResult => {
    try {
      const cst = parseLatex(latex);
      if (!cst) return { ok: false, error: 'Empty' };
      const r = resolveRow(cst, null, table.withLocals([...locals]), resolveOptions);
      return { ok: true, statement: r.statement, refs: [...r.refs] };
    } catch (e) {
      if (e instanceof MathError) return { ok: false, error: e.message };
      throw e;
    }
  };
  return { rows: analyses, resolve };
}

function analyze(
  rows: readonly RowInput[],
  { interpretationChoices = {} }: AnalyzeOptions,
): { rows: RowAnalysis[]; table: SymbolTable; resolveOptions: ResolveOptions } {
  const options: ResolveOptions = {
    interpret: (symbol, form) => {
      const found = meaningOf(symbol, form, interpretationChoices);
      return found && { meaning: found.meaning, optionId: found.option.id };
    },
    isUnit: isUnitSymbol,
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
    return s && head ? { ...s, head } : null;
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
          names: [],
          rewrites: [],
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
          names: [
            // key 'dx' marks an integral's differential (it also gets a thin space before it).
            ...(p.cst ? differentialSpans(p.cst) : []).map(
              ({ span, integral }): NameOccurrence => ({
                key: integral ? 'dx' : 'd',
                span,
                known: 'differential',
              }),
            ),
            ...definedNameOccurrence(shape),
            ...r.names,
          ],
          rewrites: r.rewrites,
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
          names: [],
          rewrites: [],
        };
      }
    });
    const selfReferencing = new Set(
      results.flatMap((r, i) =>
        r.statement?.kind === 'defConst' && r.refs.includes(r.defines ?? '') ? [i] : [],
      ),
    );
    if (selfReferencing.size === 0) return { rows: results, table, resolveOptions: options };
    excluded = new Set([...excluded, ...selfReferencing]);
  }
  throw new Error('analyzeRows: did not converge');
}

/** The name a definition row defines, if it is a multi-letter name (shown upright). */
function definedNameOccurrence(shape: DefinitionShape | null): NameOccurrence[] {
  if (!shape) return [];
  const { name } = shape.head;
  const out: NameOccurrence[] = [];
  if (shape.baseSpan && /^[A-Za-z]{2,}$/.test(name.base)) {
    out.push({ key: name.base, span: shape.baseSpan, known: 'user' });
  }
  if (shape.subSpan && name.sub !== undefined && /^[A-Za-z]{2,}$/.test(name.sub)) {
    out.push({ key: name.sub, span: shape.subSpan, known: 'subscript' });
  }
  return out;
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
