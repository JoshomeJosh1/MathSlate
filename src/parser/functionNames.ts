/**
 * How built-in functions are spelled in LaTeX when that is not `\name` (sin, log, …) or
 * `\operatorname{name}`: special functions have conventional names like Γ(x), S(x), J_n(x).
 * The parser reads these spellings back (via alias symbols built in core/builtinScope.ts), so
 * printed results round-trip.
 */
export const FUNCTION_LATEX: Readonly<Record<string, string>> = {
  gamma: '\\Gamma',
  lowergamma: '\\gamma',
  zeta: '\\zeta',
  digamma: '\\psi',
  Beta: '\\operatorname{B}',
  fresnelS: '\\operatorname{S}',
  fresnelC: '\\operatorname{C}',
  LambertW: '\\operatorname{W}',
  besselJ: '\\operatorname{J}',
  besselY: '\\operatorname{Y}',
  besselI: '\\operatorname{I}',
  besselK: '\\operatorname{K}',
  ellipticK: '\\operatorname{K}',
  ellipticE: '\\operatorname{E}',
};

/** Functions whose first argument is written as a subscript: J_n(x) = besselJ(n, x), Li_s(x). */
export const SUBSCRIPT_FIRST: ReadonlySet<string> = new Set([
  'besselJ',
  'besselY',
  'besselI',
  'besselK',
  'Li',
]);

/**
 * Symbol-table key under which a LaTeX spelling is looked up. Subscripted spellings get a
 * trailing "_" so that \operatorname{K}(m) (elliptic K) and \operatorname{K}_n(x) (Bessel K) differ.
 */
export function functionAliasKey(latex: string, subscripted: boolean): string {
  return subscripted ? `${latex}_` : latex;
}
