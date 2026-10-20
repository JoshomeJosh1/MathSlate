import type { VirtualKeyboardKeycap, VirtualKeyboardLayout } from 'mathlive';
import { MATRIX_TEMPLATE, VECTOR_TEMPLATE } from '../../core/completions';

/**
 * The math keyboard on touch screens: MathSlate's own layers instead of MathLive's defaults, which
 * offer much MathSlate does not compute with (∀, ∃, Re/Im, a preset ∫₀^∞ …). Two layers of our own
 * — "123" (numbers, variables, operators, brackets) and "f(x)" (functions, calculus, matrices,
 * results) — then MathLive's letters and Greek letters.
 *
 * Characters are sent as typed keys (`key`), not inserted LaTeX, so they go through the same
 * handling as a physical keyboard: shortcuts (sin, theta), subscript digits (x1 → x₁), matrix
 * , and ;, and \ for the command menu (MathLiveEditor.tsx). Structures are inserted as LaTeX:
 * `#?` is an empty box, `#@` the atom before the caret (x then ^ makes a power of x).
 */

type Key = string | Partial<VirtualKeyboardKeycap>;

/** A key that types a character, shown as LaTeX. */
const typed = (key: string, latex = key, extra: Partial<VirtualKeyboardKeycap> = {}): Key => ({
  latex,
  key,
  ...extra,
});

/** A key that inserts LaTeX (a structure or a command). */
const insert = (latex: string, extra: Partial<VirtualKeyboardKeycap> = {}): Key => ({
  latex,
  insert: latex,
  ...extra,
});

const SEPARATOR = '[separator-5]';

const NUMBERS: VirtualKeyboardLayout = {
  label: '123',
  tooltip: 'Numbers and operators',
  rows: [
    [
      typed('x', 'x', { variants: ['y', 'z', 't', 'k'].map((v) => typed(v)) }),
      typed('y'),
      SEPARATOR,
      typed('7'),
      typed('8'),
      typed('9'),
      typed('/', '\\frac{a}{b}', { class: 'small', tooltip: 'Fraction' }),
      SEPARATOR,
      insert('#@^{#?}', { tooltip: 'Power' }),
      insert('\\sqrt{#?}', { tooltip: 'Square root', variants: [insert('\\sqrt[#?]{#?}')] }),
      insert('\\pi', { tooltip: 'π' }),
    ],
    [
      typed('a', 'a', { variants: ['b', 'c', 'm', 'r'].map((v) => typed(v)) }),
      typed('n', 'n', { variants: ['i', 'j', 'k'].map((v) => typed(v)) }),
      SEPARATOR,
      typed('4'),
      typed('5'),
      typed('6'),
      insert('\\cdot', { tooltip: 'Multiply', variants: [insert('\\times')] }),
      SEPARATOR,
      insert('#@_{#?}', { tooltip: 'Subscript' }),
      typed('('),
      typed(')'),
    ],
    [
      typed('<', '<', {
        variants: [typed('>'), insert('\\le'), insert('\\ge'), insert('\\ne')],
        tooltip: 'Long-press for > ≤ ≥ ≠',
      }),
      typed('='),
      SEPARATOR,
      typed('1'),
      typed('2'),
      typed('3'),
      typed('-', '−'),
      SEPARATOR,
      typed('[', '[', {
        tooltip: 'Square brackets: a unit [km], or a list or matrix [1, 2; 3, 4]',
      }),
      typed(']'),
      typed('e', 'e', { tooltip: 'e (2.718…)' }),
    ],
    [
      typed('\\', '\\backslash', { tooltip: 'Everything MathSlate understands (the \\ menu)' }),
      insert('\\to', { tooltip: 'Convert to a unit (→ [km]), or a limit (x → 0)' }),
      SEPARATOR,
      typed('0'),
      typed('.'),
      typed(',', ',', { variants: [typed(';')], tooltip: 'Long-press for ;' }),
      typed('+'),
      SEPARATOR,
      '[left]',
      '[right]',
      { label: '[backspace]', width: 1 },
      '[return]',
    ],
  ],
};

const FUNCTIONS: VirtualKeyboardLayout = {
  label: 'f(x)',
  tooltip: 'Functions, calculus and matrices',
  rows: [
    [
      insert('\\sin', { variants: [insert('\\arcsin')] }),
      insert('\\cos', { variants: [insert('\\arccos')] }),
      insert('\\tan', { variants: [insert('\\arctan')] }),
      SEPARATOR,
      insert('\\ln'),
      insert('\\log', { variants: [insert('\\log_{#?}')] }),
      insert('\\exp'),
      SEPARATOR,
      insert('\\int', { tooltip: 'Integral: type _ and ^ for bounds, then dx' }),
      insert('\\frac{d}{dx}', { class: 'small', tooltip: 'Derivative' }),
      insert('\\partial'),
    ],
    [
      insert('\\sinh'),
      insert('\\cosh'),
      insert('\\tanh'),
      SEPARATOR,
      insert('\\left|#?\\right|', { tooltip: 'Absolute value, length or determinant' }),
      typed('!', '!', { tooltip: 'Factorial' }),
      insert('\\binom{#?}{#?}', { class: 'small' }),
      SEPARATOR,
      insert('\\sum_{#?}^{#?}', { class: 'small' }),
      insert('\\prod_{#?}^{#?}', { class: 'small' }),
      insert('\\lim_{#?\\to#?}', { class: 'small' }),
    ],
    [
      insert(MATRIX_TEMPLATE, {
        class: 'small',
        tooltip: 'Matrix: , goes to the next entry, ; to the next row',
      }),
      insert(VECTOR_TEMPLATE, {
        class: 'small',
        tooltip: 'Column vector: ; goes to the next entry',
      }),
      insert('\\infty'),
      SEPARATOR,
      insert('\\mathrm{ans}', { class: 'small', tooltip: 'The result above' }),
      insert('\\mathrm{out}', {
        class: 'small',
        tooltip: 'An output: type its number next (out3)',
      }),
      typed('%', '\\%'),
      SEPARATOR,
      '[left]',
      '[right]',
      { label: '[backspace]', width: 1 },
      '[return]',
    ],
  ],
};

export const KEYBOARD_LAYOUTS: (VirtualKeyboardLayout | 'alphabetic' | 'greek')[] = [
  NUMBERS,
  FUNCTIONS,
  'alphabetic',
  'greek',
];
