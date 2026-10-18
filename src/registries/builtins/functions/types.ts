export interface BuiltinFunction {
  /** Name as typed or as its LaTeX command without backslash: 'sin', 'gcd', 'erf', 'besselJ'. */
  name: string;
  /** Allowed argument counts [min, max]; max may be Infinity. */
  arity: readonly [number, number];
  description: string;
  /** Function that `name^{-1}` denotes, e.g. sin → arcsin. */
  inverse?: string;
  /**
   * A subscript supplies an argument: 'last' for \log_2 x → log(x, 2), 'first' for
   * J_n(x) → besselJ(n, x).
   */
  subscriptArg?: 'first' | 'last';
  /**
   * Only a function when followed by parentheses (special functions): without them the name
   * means what it would otherwise (Si → S·i, \zeta → the variable ζ).
   */
  callOnly?: boolean;
  /** Heading it is listed under in the `\` menu, e.g. 'Trigonometry'. Default 'Functions'. */
  group?: string;
}
