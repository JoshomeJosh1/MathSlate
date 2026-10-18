import { FUNCTION_LATEX } from '../parser/functionNames';
import { GREEK } from '../parser/lexer';
import { builtinFunctions } from '../registries/builtins/functions';
import { needsBrackets } from './builtinScope';
import { functionLatex } from './decorate';

/**
 * What the `\` menu in a math row offers: only commands MathSlate understands. `latex` is what
 * gets inserted; `#?` marks an empty box to fill in (the first one is selected).
 */
export interface LatexCompletion {
  /** The command name typed after `\`. */
  name: string;
  latex: string;
  description: string;
  /** Heading it is listed under; the menu shows groups in the order they first appear. */
  group: string;
  /** What its tile shows, if not `latex` (a function's name without the brackets). */
  display?: string;
  /** Wide tiles (function names) instead of symbol-sized ones. */
  wide?: boolean;
}

const symbols = (group: string, entries: [string, string, string][]): LatexCompletion[] =>
  entries.map(([name, latex, description]) => ({ name, latex, description, group }));

const STRUCTURES: LatexCompletion[] = [
  ...symbols('Structures', [
    ['frac', '\\frac{#?}{#?}', 'Fraction'],
    ['sqrt', '\\sqrt{#?}', 'Square root'],
    ['nthroot', '\\sqrt[#?]{#?}', 'n-th root'],
    ['binom', '\\binom{#?}{#?}', 'Binomial coefficient (n choose k)'],
  ]),
  ...symbols('Calculus', [
    ['int', '\\int', 'Integral (type _ and ^ for bounds), then dx'],
    ['defint', '\\int_{#?}^{#?}', 'Definite integral, then dx'],
    ['sum', '\\sum_{#?}^{#?}', 'Sum'],
    ['prod', '\\prod_{#?}^{#?}', 'Product'],
    ['lim', '\\lim_{#?\\to#?}', 'Limit'],
    ['partial', '\\partial', 'Partial derivative ∂ (∂/∂x)'],
    ['infty', '\\infty', 'Infinity'],
    ['to', '\\to', 'Arrow, in limits (x → 0)'],
  ]),
  ...symbols('Operators and relations', [
    ['cdot', '\\cdot', 'Multiplication dot'],
    ['times', '\\times', 'Multiplication cross'],
    ['div', '\\div', 'Division sign'],
    ['pm', '\\pm', 'Plus or minus'],
    ['mp', '\\mp', 'Minus or plus'],
    ['le', '\\le', 'Less than or equal to'],
    ['ge', '\\ge', 'Greater than or equal to'],
    ['ne', '\\ne', 'Not equal to'],
  ]),
];

function greekDescription(name: string): string {
  const capital = name.charAt(0) === name.charAt(0).toUpperCase();
  const base = name.replace(/^var/, '').toLowerCase();
  return `${capital ? 'Capital Greek' : 'Greek'} letter ${base}${name.startsWith('var') ? ' (variant)' : ''}`;
}

/** Every completion, in display order: structures, Greek letters, then functions by group. */
export function latexCompletions(): LatexCompletion[] {
  // Greek letters that also name a special function say so (Γ: "…; Γ(x) is the gamma function").
  const functionByLatex = new Map<string, string>();
  for (const f of builtinFunctions.values()) {
    const latex = FUNCTION_LATEX[f.name];
    if (latex && !functionByLatex.has(latex)) functionByLatex.set(latex, f.description);
  }
  const greek = [...GREEK]
    .filter((name) => name !== 'ell')
    .map((name) => {
      const fn = functionByLatex.get(`\\${name}`);
      return {
        name,
        latex: `\\${name}`,
        description: greekDescription(name) + (fn ? `; with brackets: ${fn}` : ''),
        group: /^[A-Z]/.test(name) ? 'Capital Greek letters' : 'Greek letters',
      };
    });
  const functions = [...builtinFunctions.values()]
    .filter((f) => /^[A-Za-z]{2,}$/.test(f.name) && !GREEK.has(f.name))
    .map((f) => ({
      name: f.name,
      // Functions that need brackets come with them, the first argument box selected.
      latex: functionLatex(f.name) + (needsBrackets(f) ? '\\left(#?\\right)' : ''),
      display: functionLatex(f.name),
      description: f.description,
      group: f.group ?? 'Functions',
      wide: true,
    }));
  return [...STRUCTURES, ...greek, ...functions];
}
