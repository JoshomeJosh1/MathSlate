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
}

const STRUCTURES: LatexCompletion[] = [
  { name: 'frac', latex: '\\frac{#?}{#?}', description: 'Fraction' },
  { name: 'sqrt', latex: '\\sqrt{#?}', description: 'Square root' },
  { name: 'nthroot', latex: '\\sqrt[#?]{#?}', description: 'n-th root' },
  { name: 'binom', latex: '\\binom{#?}{#?}', description: 'Binomial coefficient (n choose k)' },
  { name: 'int', latex: '\\int', description: 'Integral (type _ and ^ for bounds), then dx' },
  { name: 'defint', latex: '\\int_{#?}^{#?}', description: 'Definite integral, then dx' },
  { name: 'sum', latex: '\\sum_{#?}^{#?}', description: 'Sum' },
  { name: 'prod', latex: '\\prod_{#?}^{#?}', description: 'Product' },
  { name: 'lim', latex: '\\lim_{#?\\to#?}', description: 'Limit' },
  { name: 'partial', latex: '\\partial', description: 'Partial derivative ∂ (∂/∂x)' },
  { name: 'infty', latex: '\\infty', description: 'Infinity' },
  { name: 'cdot', latex: '\\cdot', description: 'Multiplication dot' },
  { name: 'times', latex: '\\times', description: 'Multiplication cross' },
  { name: 'div', latex: '\\div', description: 'Division sign' },
  { name: 'pm', latex: '\\pm', description: 'Plus or minus' },
  { name: 'mp', latex: '\\mp', description: 'Minus or plus' },
  { name: 'le', latex: '\\le', description: 'Less than or equal to' },
  { name: 'ge', latex: '\\ge', description: 'Greater than or equal to' },
  { name: 'ne', latex: '\\ne', description: 'Not equal to' },
  { name: 'to', latex: '\\to', description: 'Arrow, in limits (x → 0)' },
];

function greekDescription(name: string): string {
  const capital = name.charAt(0) === name.charAt(0).toUpperCase();
  const base = name.replace(/^var/, '').toLowerCase();
  return `${capital ? 'Capital Greek' : 'Greek'} letter ${base}${name.startsWith('var') ? ' (variant)' : ''}`;
}

/** Every completion, in display order: structures, Greek letters, then functions. */
export function latexCompletions(): LatexCompletion[] {
  const greek = [...GREEK]
    .filter((name) => name !== 'ell')
    .map((name) => ({ name, latex: `\\${name}`, description: greekDescription(name) }));
  const functions = [...builtinFunctions.values()]
    .filter((f) => /^[A-Za-z]{2,}$/.test(f.name) && !GREEK.has(f.name))
    .map((f) => ({
      name: f.name,
      // Functions that need brackets come with them, the first argument box selected.
      latex: functionLatex(f.name) + (needsBrackets(f) ? '\\left(#?\\right)' : ''),
      description: f.description,
    }));
  return [...STRUCTURES, ...greek, ...functions];
}
