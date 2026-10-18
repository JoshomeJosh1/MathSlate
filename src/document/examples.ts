import { addOutput, insertRowAfter, type Doc } from './model';

/**
 * The example slate shown on first visit (and via the Examples button). Each entry is a note
 * (`# heading` or text), a math row, or a math row with commands attached as output rows.
 * Keep every row valid: `src/document/examples.test.ts` checks that they all parse.
 */
type Entry = { note: string } | string | [latex: string, ...commandIds: string[]];

export const EXAMPLES: readonly Entry[] = [
  { note: '# Welcome to MathSlate' },
  {
    note: 'Type math on any row. Results appear underneath; click a suggestion (or type /) to add more output rows. Rows can use each other.',
  },

  { note: '# Exact arithmetic' },
  '\\frac13+\\frac16',
  '0.1+0.2',
  '\\sqrt{72}',
  '2^{100}',
  '30!',
  '\\sin\\left(\\frac{\\pi}{6}\\right)',
  'e^{i\\pi}+1',
  { note: 'e, i and π are interpreted automatically unless you define them yourself.' },

  { note: '# Constants and functions' },
  'r=5',
  'A_{circle}=\\pi r^2',
  'f\\left(x\\right)=x^2+1',
  'f\\left(3\\right)',
  'f\\left(r\\right)+f\\left(1\\right)',
  'g\\left(x,y\\right)=\\sqrt{x^2+y^2}',
  'g\\left(3,4\\right)',
  'speed=12',
  'time=3',
  'distance=speed\\cdot time',
  {
    note: 'Multi-letter names work once defined, and turn upright to show they are recognised: "speed" is one name, not s·p·e·e·d.',
  },

  { note: '# Sequences' },
  'u_n=u_{n-1}+3',
  'u_1=2',
  'u_{10}',
  's_n=\\frac{1}{n^2}',
  's_4',
  'F_{30}',
  'p_{100}',
  { note: 'F_n (Fibonacci) and p_n (primes) are built in, unless you define F or p yourself.' },

  { note: '# Algebra' },
  ['x^3-6x^2+11x-6', 'factor'],
  ['\\left(x+1\\right)^5', 'expand'],
  ['\\frac{x^2-1}{x-1}', 'simplify'],
  ['360', 'factor'],
  ['x^2-5x+6=0', 'solve'],
  ['x^2<4', 'solve'],
  ['\\sin x=\\frac12', 'solve'],
  ['x^3=2', 'solve'],

  { note: '# Calculus' },
  ['x^2\\sin x', 'derivative'],
  ['h\\left(x\\right)=xe^{x}', 'derivative', 'integrate'],
  ['\\frac{1}{1+x^2}', 'integrate'],
  ['\\frac{\\sin x}{x}', 'limit'],
  ['\\cos x', 'series'],
  ['\\ln\\left(1+x\\right)', 'series'],

  { note: '# Matrices' },
  'M=\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}',
  'M^2',
  'M^{-1}',
  '2M+\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}',

  { note: '# Live dependencies' },
  { note: 'Change k and watch the rows below update.' },
  'k=2',
  'm=k^2+1',
  'q=m\\cdot k',
  'f\\left(q\\right)',

  { note: '# Errors are reported on the row' },
  'b=c+1',
  'c=b+1',
  '\\frac{1}{\\placeholder{}}',
];

export function exampleDoc(): Doc {
  let doc: Doc = { version: 1, rows: [], interpretations: {}, nextOutputLabel: 1 };
  for (const entry of EXAMPLES) {
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
