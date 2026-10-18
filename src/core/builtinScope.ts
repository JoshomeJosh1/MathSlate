import { SymbolTable, type SymbolInfo } from '../parser/symbols';
import { builtinFunctions } from '../registries/builtins/functions';

/**
 * Root scope with the built-in functions. User definitions live in a child scope and shadow these.
 * Constants (e, i, π) and built-in sequences (p_n, F_n) are not symbols: they are interpretations
 * of otherwise undefined names (registries/interpretations), so users can still define their own.
 */
export function createBuiltinScope(): SymbolTable {
  const entries: SymbolInfo[] = [];
  for (const f of builtinFunctions.values()) {
    const info: SymbolInfo = { key: f.name, kind: 'builtinFunction', arity: f.arity };
    if (f.inverse) info.inverse = f.inverse;
    if (f.subscriptArg) info.subscriptArg = true;
    entries.push(info);
  }
  return new SymbolTable(entries);
}
