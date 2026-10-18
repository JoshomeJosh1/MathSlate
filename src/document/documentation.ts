import { addOutput, insertRowAfter, type Doc } from './model';

/**
 * The documentation slate: shown on first visit and via the Documentation button. It is a working
 * document that demonstrates everything MathSlate can do. `documentation.test.ts` fails if a
 * built-in function, sequence, constant, command or calculus operator is missing from it, or if any
 * row has an error that is not intentional — so add an example whenever you add a feature.
 *
 * Each entry is a note (`# heading` or text), a math row, or a math row with commands attached.
 */
type Entry = { note: string } | string | [latex: string, ...commandIds: string[]];

export const DOCUMENTATION: readonly Entry[] = [
  { note: '# MathSlate' },
  {
    note: 'A notebook for exact, symbolic math. Every row below is live: edit anything and the results update. Click New for an empty slate; this page comes back with the Documentation button.',
  },

  { note: '# Typing' },
  {
    note: 'Type math as on paper: 2x, x^2 (type ^ for powers, → to leave them), / for fractions, sqrt, pi, theta. Enter adds a row, Backspace on an empty row deletes it, ↑/↓ move between rows, and the number on the left drags a row.',
  },
  {
    note: 'Type " in an empty row to turn it into a note like this one. Backspace in an empty note turns it back into math.',
  },
  {
    note: 'Results appear in tinted output rows. Under the row you are editing, suggested commands appear: click one to add it as an output row (labelled out1, out2, …). ↧ copies a result into a new row; × removes an output.',
  },

  { note: '# Arithmetic is exact' },
  '\\frac13+\\frac16',
  '0.1+0.2',
  '\\sqrt{72}',
  '\\sqrt[3]{54}',
  '2^{100}',
  '30!',
  '\\binom{10}{3}',
  '\\left|3-8\\right|',
  '50\\%\\cdot 80',
  ['\\sqrt2+\\pi', 'numeric'],
  { note: 'Decimals like 0.1 are exact fractions; a ≈ decimal is shown alongside exact numbers.' },

  { note: '# Constants' },
  { note: 'π, e and i are recognised automatically unless you define them yourself.' },
  '\\pi',
  'e',
  'e^{i\\pi}+1',
  '\\sqrt{-4}',
  '\\lim_{x\\to\\infty}\\frac{1}{x}',

  { note: '# Built-in functions' },
  { note: 'Trigonometry (radians) and inverses; sin^{-1} also means arcsin.' },
  '\\sin\\left(\\frac{\\pi}{6}\\right)+\\cos\\left(\\frac{\\pi}{3}\\right)+\\tan\\left(\\frac{\\pi}{4}\\right)',
  '\\cot\\left(\\frac{\\pi}{4}\\right)+\\sec\\left(0\\right)+\\csc\\left(\\frac{\\pi}{2}\\right)',
  '\\arcsin\\left(1\\right)+\\arccos\\left(0\\right)+\\arctan\\left(1\\right)',
  'arccot(1)+arcsec(1)+arccsc(1)',
  '\\sin^{-1}\\left(\\frac{1}{2}\\right)',
  { note: 'Hyperbolic functions and their inverses.' },
  '\\sinh\\left(0\\right)+\\cosh\\left(0\\right)+\\tanh\\left(0\\right)',
  '\\coth\\left(1\\right)+sech(0)+csch(1)',
  'arsinh(0)+arcosh(1)+artanh(0)',
  { note: 'Exponentials and logarithms: ln is natural, log is base 10, log_b is base b.' },
  '\\exp\\left(2\\right)',
  '\\ln\\left(e^3\\right)+\\log\\left(1000\\right)+\\log_2 8',
  { note: 'Rounding, sign, and integer functions.' },
  'floor(2.7)+ceil(2.2)+sign(-3)',
  '\\gcd\\left(12,18\\right)+lcm(4,6)',
  '\\max\\left(3,7,5\\right)-\\min\\left(3,7,5\\right)',
  'binomial(5,2)',

  { note: '# Your own names and functions' },
  'r=5',
  'A_{circle}=\\pi r^2',
  'v_{max}=30',
  'speed=12',
  'time=3',
  'distance=speed\\cdot time',
  {
    note: 'Multi-letter names and subscripts turn upright once recognised: "speed" is one name, not s·p·e·e·d. Undefined letters next to each other multiply: 2xy is 2·x·y.',
  },
  'f\\left(x\\right)=x^2+1',
  'f\\left(3\\right)+f\\left(r\\right)',
  'g\\left(x,y\\right)=\\sqrt{x^2+y^2}',
  'g\\left(3,4\\right)',
  'f^{\\prime}\\left(2\\right)+f^{\\prime\\prime}\\left(2\\right)',
  {
    note: "Type f' for the derivative of your function f, f'' for the second derivative, and so on.",
  },

  { note: '# Sequences' },
  { note: 'Define a sequence with a subscript; add base cases for recursion.' },
  'u_n=u_{n-1}+3',
  'u_1=2',
  'u_{10}',
  's_n=\\frac{1}{n^2}',
  's_4',
  {
    note: 'Built in: p_n is the n-th prime and F_n the n-th Fibonacci number (unless you define p or F).',
  },
  'p_{100}',
  'F_{30}',

  { note: '# Algebra' },
  { note: 'These rows have commands attached. Click a row to see more suggestions.' },
  ['x^3-6x^2+11x-6', 'factor'],
  ['360', 'factor'],
  ['\\left(x+1\\right)^5', 'expand'],
  ['\\frac{x^2-1}{x-1}', 'simplify'],
  ['x^2-5x+6=0', 'solve'],
  ['x^3=2', 'solve'],
  ['\\sin x=\\frac12', 'solve'],
  ['x^2<4', 'solve'],

  { note: '# Calculus' },
  {
    note: 'Write calculus directly. Indefinite integrals give an antiderivative. Definite integrals show a number straight away, then the exact value when one exists (like 1/3 ≈ 0.333); without a closed form the number stays.',
  },
  {
    note: 'Type int for ∫, then the integrand and dx. For a definite integral, type _ and ^ right after ∫ to add the bounds. Type d/dx for a derivative and lim for a limit. The d of dx turns upright once it is recognised as calculus; elsewhere d is an ordinary variable.',
  },
  '\\int x^2\\,dx',
  '\\int xe^{x}\\,dx',
  '\\int_0^1x^2\\,dx',
  '\\int_0^{\\infty}e^{-x^2}\\,dx',
  '\\frac{d}{dx}x^3\\sin x',
  '\\frac{d^2}{dx^2}e^{3x}',
  '\\frac{\\partial}{\\partial y}x^2y^3',
  '\\lim_{x\\to0}\\frac{\\sin x}{x}',
  '\\lim_{x\\to0^{+}}x\\ln x',
  '\\sum_{k=1}^{100}k',
  '\\sum_{n=1}^{\\infty}\\frac{1}{n^2}',
  '\\prod_{k=1}^{6}k',
  { note: 'Or use commands on any expression.' },
  ['x^2\\sin x', 'derivative'],
  ['h\\left(x\\right)=xe^{x}', 'derivative', 'integrate'],
  ['\\frac{1}{1+x^2}', 'integrate'],
  ['\\frac{e^x-1}{x}', 'limit'],
  ['\\cos x', 'series'],

  { note: '# Matrices and sets' },
  'M=\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}',
  'M^2',
  'M^{-1}',
  '2M+\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}',
  '\\begin{bmatrix}1&2&3\\end{bmatrix}\\begin{bmatrix}4\\\\5\\\\6\\end{bmatrix}',
  '\\left\\lbrace3,1,2,1\\right\\rbrace',

  { note: '# Live dependencies' },
  { note: 'Change k and watch every row that depends on it update.' },
  'k=2',
  'm=k^2+1',
  'q=m\\cdot k',
  'f\\left(q\\right)',

  { note: '# Errors' },
  { note: 'Mistakes are reported on their row, with the problem highlighted.' },
  'b=c+1',
  'c=b+1',
  '\\frac{1}{\\placeholder{}}',
  '2^3^4',

  { note: '# Computer algebra systems' },
  {
    note: 'Results come from SymPy, running in your browser. While it loads (a few seconds on first visit), Nerdamer answers instantly; those results are marked "via Nerdamer" and upgrade automatically. Choose the preferred system with the CAS menu.',
  },
];

export function documentationDoc(): Doc {
  let doc: Doc = { version: 1, rows: [], interpretations: {}, nextOutputLabel: 1 };
  for (const entry of DOCUMENTATION) {
    if (typeof entry === 'object' && !Array.isArray(entry)) {
      doc = insertRowAfter(doc, null, entry.note, 'note').doc;
      continue;
    }
    const [latex, ...commandIds] = Array.isArray(entry) ? entry : [entry];
    const inserted = insertRowAfter(doc, null, latex);
    doc = inserted.doc;
    for (const id of commandIds) doc = addOutput(doc, inserted.id, id);
  }
  return doc;
}
