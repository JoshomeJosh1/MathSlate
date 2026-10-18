export interface BuiltinFunction {
  /** Name as typed or as its LaTeX command without backslash: 'sin', 'gcd', 'floor'. */
  name: string;
  /** Allowed argument counts [min, max]; max may be Infinity. */
  arity: readonly [number, number];
  description: string;
  /** Function that `name^{-1}` denotes, e.g. sin → arcsin. */
  inverse?: string;
  /**
   * For functions written with a subscript, e.g. \log_2 x: the subscript becomes this extra
   * trailing argument (log(x, 2)).
   */
  subscriptArg?: boolean;
}
