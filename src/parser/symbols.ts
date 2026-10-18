export type SymbolKind =
  | 'variable' // user-defined constant/expression: a = 123, speed = 3
  | 'function' // user-defined function: f(x) = …
  | 'sequence' // user-defined sequence: a_n = …
  | 'local' // function parameter or sequence index inside a definition body
  | 'builtinFunction';

export interface SymbolInfo {
  key: string;
  kind: SymbolKind;
  /** Row that defines it (user symbols only). */
  definedBy?: string;
  /** For callables: allowed argument counts. */
  arity?: readonly [number, number];
  /** For builtin functions: what `name^{-1}` means (sin → arcsin). */
  inverse?: string;
  /** For builtin functions written with a subscript argument (\log_2 x → log(x, 2)). */
  subscriptArg?: 'first' | 'last';
  /** Only callable when followed by parentheses; otherwise the name is an ordinary symbol. */
  callOnly?: boolean;
  /** For alias symbols (\Gamma, \operatorname{S}): the built-in function they name. */
  canonical?: string;
}

const CALLABLE: ReadonlySet<SymbolKind> = new Set(['function', 'builtinFunction']);

export const isCallable = (
  s: SymbolInfo | undefined,
): s is SymbolInfo & { kind: 'function' | 'builtinFunction' } => !!s && CALLABLE.has(s.kind);
export const isSequence = (s: SymbolInfo | undefined): s is SymbolInfo & { kind: 'sequence' } =>
  s?.kind === 'sequence';

/**
 * Immutable name → symbol map with lexical scoping. `withLocals` creates a child scope for
 * function parameters / sequence indices that shadow outer names.
 */
export class SymbolTable {
  private readonly symbols: ReadonlyMap<string, SymbolInfo>;
  private readonly parent: SymbolTable | undefined;
  /** Longest key made only of Latin letters, bounding the longest-match search. */
  readonly maxRunLength: number;

  constructor(entries: Iterable<SymbolInfo>, parent?: SymbolTable) {
    const map = new Map<string, SymbolInfo>();
    for (const e of entries) map.set(e.key, e);
    this.symbols = map;
    this.parent = parent;
    let max = parent?.maxRunLength ?? 1;
    for (const key of map.keys()) {
      const run = /^[A-Za-z]+/.exec(key)?.[0].length ?? 1;
      if (run > max) max = run;
    }
    this.maxRunLength = max;
  }

  lookup(key: string): SymbolInfo | undefined {
    return this.symbols.get(key) ?? this.parent?.lookup(key);
  }

  isLocal(key: string): boolean {
    return this.lookup(key)?.kind === 'local';
  }

  withLocals(keys: Iterable<string>): SymbolTable {
    return new SymbolTable(
      [...keys].map((key) => ({ key, kind: 'local' as const })),
      this,
    );
  }
}
