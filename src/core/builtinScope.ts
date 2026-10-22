import { FUNCTION_LATEX, SUBSCRIPT_FIRST, functionAliasKey } from '../parser/functionNames';
import { setReservedLetterRuns } from '../parser/printLatex';
import { SymbolTable, type SymbolInfo } from '../parser/symbols';
import { builtinFunctions, type BuiltinFunction } from '../registries/builtins/functions';

/**
 * Root scope with the built-in functions. User definitions live in a child scope, but cannot
 * define these names (`reservedNameError` in analyze.ts), nor e, i, π, ans or out. Constants
 * (e, i, π) and built-in sequences (p_n, F_n) are not symbols: they are interpretations of
 * otherwise undefined names (registries/interpretations).
 *
 * Functions with a conventional LaTeX spelling (Γ, \operatorname{S}, \operatorname{J}_n) also get
 * an alias entry under that spelling, pointing at the canonical function.
 */
export function createBuiltinScope(): SymbolTable {
  const entries: SymbolInfo[] = [];
  for (const f of builtinFunctions.values()) {
    const info: SymbolInfo = { key: f.name, kind: 'builtinFunction', arity: f.arity };
    if (f.inverse) info.inverse = f.inverse;
    if (f.subscriptArg) info.subscriptArg = f.subscriptArg;
    // Functions of two or more arguments can only be called with brackets, so without them their
    // letters keep their ordinary meaning (lcmab is l·c·m·a·b, not "lcm" next to ab).
    if (needsBrackets(f)) info.callOnly = true;
    entries.push(info);
    for (const alias of f.aliases ?? []) entries.push({ ...info, key: alias, canonical: f.name });
    const latex = FUNCTION_LATEX[f.name];
    if (latex) {
      const key = functionAliasKey(latex, SUBSCRIPT_FIRST.has(f.name));
      entries.push({ ...info, key, canonical: f.name, callOnly: true });
    }
  }
  // References to results (core/outputRefs.ts): ans, the nearest result above, and out_k, an
  // output by its label. Shown upright like defined names; reserved.
  entries.push({ key: ANS, kind: 'variable' }, { key: OUT, kind: 'sequence' });
  return new SymbolTable(entries);
}

export const ANS = 'ans';
export const OUT = 'out';

/** Whether a built-in function only means itself when followed by brackets. */
export function needsBrackets(f: BuiltinFunction): boolean {
  return f.callOnly === true || f.arity[0] >= 2;
}

// Results print single letters side by side (xy) unless they would spell one of these names.
setReservedLetterRuns([
  ...[...builtinFunctions.values()].flatMap((f) => [f.name, ...(f.aliases ?? [])]),
  ANS,
  OUT,
]);
