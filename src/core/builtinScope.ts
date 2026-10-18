import { FUNCTION_LATEX, SUBSCRIPT_FIRST, functionAliasKey } from '../parser/functionNames';
import { SymbolTable, type SymbolInfo } from '../parser/symbols';
import { builtinFunctions, type BuiltinFunction } from '../registries/builtins/functions';

/**
 * Root scope with the built-in functions. User definitions live in a child scope and shadow these.
 * Constants (e, i, π) and built-in sequences (p_n, F_n) are not symbols: they are interpretations
 * of otherwise undefined names (registries/interpretations), so users can still define their own.
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
  return new SymbolTable(entries);
}

/** Whether a built-in function only means itself when followed by brackets. */
export function needsBrackets(f: BuiltinFunction): boolean {
  return f.callOnly === true || f.arity[0] >= 2;
}
