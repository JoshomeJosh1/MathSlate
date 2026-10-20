import type { VirtualKeyboardKeycap, VirtualKeyboardLayout } from 'mathlive';
import { MATRIX_TEMPLATE, VECTOR_TEMPLATE } from '../../core/completions';

/**
 * The math keyboard on touch screens. The main tab has every letter, a row of digits and the
 * symbols and structures that letters cannot produce; anything that can be typed as letters (sin,
 * pi, int, theta, -> for →) is left to the shortcuts. Tabs for functions and calculus (f(x)), a
 * calculator numpad (123) and Greek letters (MathLive's own) hold the rest at full size.
 * Long-presses (variants) and shift give related keys: = → ≠, < → ≤, [ → a matrix, …
 *
 * Labels are text or HTML, never LaTeX templates (whose empty boxes rendered badly). Characters
 * are sent as typed keys (`key`), so they go through the same handling as a physical keyboard
 * (MathLiveEditor.tsx): shortcuts, subscript digits (x1 → x₁), matrix , and ;, and \ for the
 * command menu. Structures are inserted as LaTeX: `#?` is an empty box, `#@` the atom before the
 * caret (x then xʸ makes a power of x).
 */

type Key = string | Partial<VirtualKeyboardKeycap>;
type Extra = Partial<VirtualKeyboardKeycap>;

/** A key that types a character; `label` is its label (default: the character). */
const typed = (key: string, label = key, extra: Extra = {}): Partial<VirtualKeyboardKeycap> => ({
  label,
  key,
  ...extra,
});

/** A key that inserts LaTeX (a structure or a command), with an HTML label. */
const insert = (
  latex: string,
  label: string,
  extra: Extra = {},
): Partial<VirtualKeyboardKeycap> => ({
  label,
  insert: latex,
  ...extra,
});

/** A letter, with its capital on shift. */
const letter = (c: string): Key => typed(c, c, { shift: typed(c.toUpperCase()) });

const HALF = '[separator-5]';
const LEFT = '[left]';
const RIGHT = '[right]';
const BACKSPACE = '[backspace]';
const RETURN = '[return]';

// Structures and symbols shared by the tabs.
const power = insert('#@^{#?}', 'xʸ', {
  tooltip: 'Power',
  shift: insert('#@_{#?}', 'xₙ'),
  variants: [insert('#@^{2}', 'x²'), insert('#@_{#?}', 'xₙ'), insert('#@^{-1}', 'x⁻¹')],
});
const root = insert('\\sqrt{#?}', '√', {
  tooltip: 'Square root',
  shift: insert('\\sqrt[#?]{#?}', 'ⁿ√'),
  variants: [insert('\\sqrt[3]{#?}', '∛'), insert('\\sqrt[#?]{#?}', 'ⁿ√')],
});
// Typed like a bracket: MathLive's smart fences pair it (no empty box; deleting leaves nothing).
const abs = typed('|', '|', { tooltip: 'Absolute value, length or determinant' });
const matrix = insert(MATRIX_TEMPLATE, 'mat', {
  class: 'small',
  tooltip: 'Matrix: , goes to the next entry, ; to the next row',
});
const vector = insert(VECTOR_TEMPLATE, 'vec', {
  class: 'small',
  tooltip: 'Column vector: ; goes to the next entry',
});
const ans = insert('\\mathrm{ans}', 'ans', { class: 'small', tooltip: 'The result above' });
const out = insert('\\mathrm{out}', 'out', {
  class: 'small',
  tooltip: 'An output: type its number next (out3)',
});
// No ± / ∓: MathSlate does not compute with them.
const plus = typed('+');
const minus = typed('-', '−');
const times = insert('\\cdot', '×', {
  tooltip: 'Multiply (shift: cross product ×)',
  shift: insert('\\times', '⨯'),
  variants: [insert('\\times', '⨯')],
});
const divide = typed('/', '/', { tooltip: 'Fraction' });
const equals = typed('=', '=', { shift: insert('\\ne', '≠'), variants: [insert('\\ne', '≠')] });
const less = typed('<', '<', { shift: insert('\\le', '≤'), variants: [insert('\\le', '≤')] });
const greater = typed('>', '>', {
  tooltip: '- then > makes →',
  shift: insert('\\ge', '≥'),
  variants: [insert('\\ge', '≥')],
});
// Braces (a set {1, 2, 3}) on shift and long-press of the round brackets.
const openBrace = typed('{', '{');
const closeBrace = typed('}', '}');
const open = typed('(', '(', { shift: openBrace, variants: [openBrace] });
const close = typed(')', ')', { shift: closeBrace, variants: [closeBrace] });
const openSquare = typed('[', '[', { tooltip: 'A unit [km], or a list or matrix [1, 2; 3, 4]' });
const closeSquare = typed(']');
const comma = typed(',');
const factorial = typed('!', '!', { shift: typed('%'), variants: [typed('%')] });
const menu = typed('\\', '\\', { tooltip: 'Everything MathSlate understands (the \\ menu)' });
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';
/** Digits: shift makes the power xᵈ, long-press gives the power or the subscript xₐ. */
const digit = (d: string): Key => {
  const power = insert(`#@^{${d}}`, `x${SUPERSCRIPT[Number(d)]}`);
  const sub = insert(`#@_{${d}}`, `x${SUBSCRIPT[Number(d)]}`);
  return typed(d, d, { shift: power, variants: [power, sub] });
};

/** The characters of a string of plain ASCII keys. */
const chars = (keys: string): string[] => keys.split(/(?=.)/);

const MATH: VirtualKeyboardLayout = {
  label: 'abc',
  tooltip: 'Letters, numbers and symbols',
  rows: [
    chars('1234567890').map(digit),
    chars('qwertyuiop').map(letter),
    [HALF, ...chars('asdfghjkl').map(letter), HALF],
    [
      { label: '[shift]', width: 1.5 },
      ...chars('zxcvbnm').map(letter),
      { label: BACKSPACE, width: 1.5 },
    ],
    [plus, minus, times, divide, equals, power, abs, open, close, openSquare, closeSquare],
    [
      menu,
      comma,
      typed(';'),
      typed('.'),
      root,
      factorial,
      less,
      greater,
      LEFT,
      RIGHT,
      { label: RETURN, width: 1 },
    ],
  ],
};

/** A function key: inserts \name, labelled with its name. */
const fn = (name: string, label = name, extra: Extra = {}): Key =>
  insert(`\\${name}`, label, extra);

const FUNCTIONS: VirtualKeyboardLayout = {
  label: 'f(x)',
  tooltip: 'Functions and calculus',
  rows: [
    [
      fn('sin', 'sin', { variants: [fn('csc')] }),
      fn('cos', 'cos', { variants: [fn('sec')] }),
      fn('tan', 'tan', { variants: [fn('cot')] }),
      fn('ln'),
      fn('log', 'log', { variants: [insert('\\log_{#?}', 'logₐ')] }),
      fn('exp'),
      insert('\\pi', 'π'),
      typed('e'),
      insert('\\sqrt[3]{#?}', '∛'),
      BACKSPACE,
    ],
    [
      fn('arcsin', 'sin⁻¹'),
      fn('arccos', 'cos⁻¹'),
      fn('arctan', 'tan⁻¹'),
      fn('sinh'),
      fn('cosh'),
      fn('tanh'),
      typed('!', 'n!'),
      insert('\\binom{#?}{#?}', 'binom', { class: 'small', tooltip: 'Binomial coefficient' }),
      typed('%'),
      typed("'", '′', { tooltip: "Derivative of your function: f'(x)" }),
    ],
    [
      insert('\\int', '∫', { tooltip: 'Integral: then dx (type _ and ^ for bounds)' }),
      insert('\\int_{#?}^{#?}', '∫ₐᵇ', { tooltip: 'Definite integral' }),
      insert('\\frac{d}{dx}', 'd/dx', { class: 'small', tooltip: 'Derivative' }),
      insert('\\partial', '∂'),
      insert('\\sum_{#?}^{#?}', '∑'),
      insert('\\prod_{#?}^{#?}', '∏'),
      insert('\\lim_{#?\\to#?}', 'lim'),
      insert('\\infty', '∞'),
      insert('\\to', '→'),
    ],
    [ans, out, matrix, vector, open, close, LEFT, RIGHT, RETURN],
  ],
};

const NUMPAD: VirtualKeyboardLayout = {
  label: '123',
  tooltip: 'Numbers',
  rows: [
    [
      typed('x'),
      typed('y'),
      open,
      close,
      HALF,
      digit('7'),
      digit('8'),
      digit('9'),
      divide,
      { label: BACKSPACE, width: 1 },
    ],
    [
      typed('a'),
      typed('n'),
      openSquare,
      closeSquare,
      HALF,
      digit('4'),
      digit('5'),
      digit('6'),
      times,
      LEFT,
    ],
    [less, equals, power, root, HALF, digit('1'), digit('2'), digit('3'), minus, RIGHT],
    [
      insert('\\pi', 'π'),
      typed('e'),
      comma,
      insert('\\to', '→'),
      HALF,
      digit('0'),
      typed('.'),
      plus,
      { label: RETURN, width: 2 },
    ],
  ],
};

export const KEYBOARD_LAYOUTS: (VirtualKeyboardLayout | 'greek')[] = [
  MATH,
  FUNCTIONS,
  NUMPAD,
  'greek',
];

/** Every LaTeX a key inserts (main keys, shift and long-press variants), for tests. */
export function insertedLatex(): string[] {
  const out: string[] = [];
  const visit = (k: Key) => {
    if (typeof k === 'string') return;
    if (k.insert) out.push(k.insert);
    if (typeof k.shift === 'object') visit(k.shift);
    if (Array.isArray(k.variants)) k.variants.forEach(visit);
  };
  for (const layout of KEYBOARD_LAYOUTS) {
    if (typeof layout === 'string' || !('rows' in layout)) continue;
    layout.rows.flat().forEach(visit);
  }
  return out;
}
