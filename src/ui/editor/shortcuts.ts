import type { InlineShortcutDefinitions } from 'mathlive';
import { MATRIX_TEMPLATE, VECTOR_TEMPLATE } from '../../core/completions';
import { GREEK } from '../../parser/lexer';

/**
 * The inline shortcuts MathSlate uses instead of MathLive's ~260 defaults. MathLive's list is a
 * general-purpose one: many of its shortcuts produce notation we do not compute with (sets,
 * logic, arrows, units) and, worse, fire inside ordinary letter runs — "binom" became b∈om,
 * "of" ∘, "lt" <, "xx" ×, "cm" an upright unit. Here a shortcut is kept only if it produces
 * LaTeX the parser understands and is unlikely to be a product of single-letter variables.
 *
 * Built-in function names (sin, lcm, …) are not listed here: they come from the function
 * registry (`functionShortcuts` in core/decorate.ts), like user-defined names.
 */

/**
 * Where MathLive lets a short shortcut fire: not straight after a letter, so a product of
 * variables that happens to spell "mu" or "tau" stays letters.
 */
const NOT_AFTER_LETTER =
  'nothing+digit+function+frac+surd+binop+relop+punct+array+openfence+closefence+space+text';
const notAfterLetter = (value: string) => ({ after: NOT_AFTER_LETTER, value });

/** Greek letters short enough to be products of variables (MathLive guards the same ones). */
const GUARDED_GREEK = new Set(['eta', 'mu', 'nu', 'xi', 'rho', 'tau', 'phi', 'Phi', 'psi', 'Psi']);

const greek: InlineShortcutDefinitions = Object.fromEntries(
  [...GREEK]
    .filter((name) => name !== 'ell') // "ell" is too likely to be letters
    .map((name) => [name, GUARDED_GREEK.has(name) ? notAfterLetter(`\\${name}`) : `\\${name}`]),
);

export const INLINE_SHORTCUTS: InlineShortcutDefinitions = {
  ...greek,
  µ: '\\mu',

  // Constants (e, i and π also work as plain letters; see the interpretations registry).
  infty: '\\infty',
  infinity: '\\infty',
  '∞': '\\infty',
  oo: notAfterLetter('\\infty'),

  // Structures
  sqrt: '\\sqrt{#?}',
  cbrt: '\\sqrt[3]{#?}',
  nthroot: '\\sqrt[#?]{#?}',
  frac: '\\frac{#?}{#?}',
  binom: '\\binom{#?}{#?}',
  // Not straight after a letter: "format" stays letters.
  mat: notAfterLetter(MATRIX_TEMPLATE),
  vec: notAfterLetter(VECTOR_TEMPLATE),

  // "sin" waits to see whether "sinh" follows, so without this "sint" would end in "int" → s∫.
  sint: '\\sin t',

  // Results (core/outputRefs.ts): ans and out (a digit typed next becomes its subscript, as
  // after any letter: out3 → out₃; see canSubscript in MathLiveEditor.tsx).
  ans: notAfterLetter('\\mathrm{ans}'),
  out: notAfterLetter('\\mathrm{out}'),

  // Calculus. A bare integral sign (type _ and ^ after it for bounds); "defint" gives the boxes.
  // Not straight after a letter, so "point" or "print" stay letters (x int, with a space, works).
  int: notAfterLetter('\\int'),
  defint: '\\int_{#?}^{#?}',
  sum: '\\sum_{#?}^{#?}',
  '∑': '\\sum_{#?}^{#?}',
  prod: '\\prod_{#?}^{#?}',
  lim: '\\lim_{#?\\to#?}',
  // Typing "partial" gives ∂, so partial/partial x makes ∂/∂x like d/dx makes d/dx.
  partial: '\\partial',
  '∂': '\\partial',
  // No dx → \differentialD: the parser decides what is a differential (core/decorate.ts makes
  // the d of recognised calculus upright), so d·x elsewhere is not mangled.

  // Primes: MathLive's default turns '' into the single glyph \doubleprime (″), which looks
  // different from ''' (three ordinary primes); use ordinary primes for every order.
  "''": '^{\\prime\\prime}',
  "'''": '^{\\prime\\prime\\prime}',
  "''''": '^{\\prime\\prime\\prime\\prime}',

  // Operators and relations
  '*': '\\cdot',
  times: '\\times',
  '÷': '\\div',
  '+-': '\\pm',
  '-+': '\\mp',
  '!=': '\\ne',
  '≠': '\\ne',
  '<=': '\\le',
  '≤': '\\le',
  '>=': '\\ge',
  '≥': '\\ge',
  '->': '\\to',
  '%': '\\%',
};
