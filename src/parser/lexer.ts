import { MathError, type Span } from './errors';

/**
 * LaTeX tokenizer tuned to what MathLive emits (and to SymPy's `latex()` output). Presentation
 * noise is dropped here (`\left`/`\right` sizing, spacing commands, `\displaystyle`), so the parser
 * only sees mathematical structure.
 */

export type Delim = '(' | ')' | '[' | ']' | '{' | '}' | 'lset' | 'rset';
export type PipeRole = 'open' | 'close' | 'either';

export type Token =
  | { kind: 'num'; value: string; span: Span }
  /** A single-letter identifier: Latin letter or Greek command name such as `\alpha`. */
  | { kind: 'letter'; name: string; span: Span }
  /** Multi-letter upright name: `\operatorname{gcd}`, `\mathrm{max}`, `\text{speed}`. */
  | { kind: 'opname'; name: string; operator?: boolean; span: Span }
  /** LaTeX function operator such as `\sin`, `\log`, `\det` (name without backslash). */
  | { kind: 'fn'; name: string; span: Span }
  | { kind: 'special'; id: SpecialId; span: Span }
  | { kind: 'op'; op: OpSymbol; span: Span }
  | { kind: 'rel'; op: RelSymbol; span: Span }
  | { kind: 'delim'; delim: Delim; sized: boolean; span: Span }
  | { kind: 'pipe'; role: PipeRole; span: Span }
  | { kind: 'cmd'; name: string; span: Span } // structural: frac, sqrt, begin, end, ...
  | { kind: 'env'; which: 'begin' | 'end'; env: string; span: Span }
  | { kind: 'sub'; span: Span } // _
  | { kind: 'sup'; span: Span } // ^
  | { kind: 'comma'; span: Span }
  | { kind: 'amp'; span: Span } // & (matrix column separator)
  | { kind: 'rowsep'; span: Span } // \\ (matrix row separator)
  | { kind: 'bang'; span: Span } // ! factorial
  | { kind: 'prime'; span: Span } // ' or \prime
  | { kind: 'percent'; span: Span } // \%
  | { kind: 'to'; span: Span } // \to (limits)
  | { kind: 'placeholder'; span: Span } // \placeholder{} (empty MathLive box)
  | { kind: 'eof'; span: Span };

export type SpecialId = 'exponentialE' | 'imaginaryI' | 'infinity';
export type OpSymbol = '+' | '-' | '*' | '/' | 'cdot' | 'times' | 'div' | 'pm' | 'mp';
export type RelSymbol = '=' | '<' | '>' | '<=' | '>=' | '!=';

export const GREEK = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'varpi', 'rho', 'varrho', 'sigma', 'varsigma',
  'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda',
  'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega', 'ell',
]); // prettier-ignore

/**
 * The operator names standard LaTeX (and MathLive) define, so `\sin` renders. Others in
 * FUNCTION_COMMANDS (`\sech`, `\arccot`, …) are accepted as input but printed as \operatorname.
 */
export const LATEX_FUNCTION_COMMANDS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'coth', 'ln', 'log', 'lg', 'exp', 'det', 'dim', 'gcd', 'max', 'min', 'sup', 'inf', 'lim', 'arg',
  'deg', 'ker', 'hom', 'Pr',
]); // prettier-ignore

/** LaTeX operator commands we read as functions (rendered upright, take an argument). */
export const FUNCTION_COMMANDS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'arccot', 'arcsec',
  'arccsc', 'sinh', 'cosh', 'tanh', 'coth', 'sech', 'csch', 'arsinh', 'arcosh', 'artanh', 'ln',
  'log', 'lg', 'lb', 'exp', 'det', 'dim', 'gcd', 'max', 'min', 'sup', 'inf', 'lim', 'arg', 'deg',
  'ker', 'hom', 'Pr', 'tr', 'rank', 'mod',
]); // prettier-ignore

const SIMPLE_OPS: Record<string, OpSymbol> = {
  cdot: 'cdot',
  times: 'times',
  div: 'div',
  ast: '*',
  star: '*',
  pm: 'pm',
  mp: 'mp',
};

const RELATIONS: Record<string, RelSymbol> = {
  le: '<=',
  leq: '<=',
  leqslant: '<=',
  ge: '>=',
  geq: '>=',
  geqslant: '>=',
  ne: '!=',
  neq: '!=',
  lt: '<',
  gt: '>',
};

const SPECIALS: Record<string, SpecialId> = {
  exponentialE: 'exponentialE',
  imaginaryI: 'imaginaryI',
  infty: 'infinity',
};

/** Commands that carry no mathematical meaning for us. */
const IGNORED = new Set([
  ',', ';', ':', '!', ' ', 'quad', 'qquad', 'displaystyle', 'textstyle', 'thinspace', 'medspace',
  'thickspace', 'enspace', 'negthinspace', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl',
  'Bigr', 'limits', 'nolimits',
]); // prettier-ignore

/** Commands whose `{...}` argument is an upright multi-letter name. */
const TEXT_NAME_COMMANDS = new Set([
  'operatorname',
  'mathrm',
  'text',
  'textrm',
  'mathit',
  'mathsf',
]);

/** Delimiter commands, after optional `\left`/`\right`/`\mleft`/`\mright`. */
const DELIM_COMMANDS: Record<string, Delim | 'pipe'> = {
  lbrack: '[',
  rbrack: ']',
  lbrace: 'lset',
  rbrace: 'rset',
  '{': 'lset',
  '}': 'rset',
  vert: 'pipe',
  lvert: 'pipe',
  rvert: 'pipe',
  '|': 'pipe',
  lparen: '(',
  rparen: ')',
};

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  /** Set when the previous command was \left or \right (affects the next delimiter). */
  let sizing: 'left' | 'right' | null = null;
  let sizingStart = 0;

  const push = (t: Token) => {
    tokens.push(t);
  };

  const readCommandName = (): string => {
    // At src[i] === '\\'. Returns the command name and advances past it.
    const start = i + 1;
    if (start >= src.length)
      throw new MathError('Incomplete command "\\"', { start: i, end: i + 1 });
    const first = src.charAt(start);
    if (!/[A-Za-z]/.test(first)) {
      i = start + 1;
      return first;
    }
    let j = start;
    while (j < src.length && /[A-Za-z]/.test(src.charAt(j))) j++;
    i = j;
    return src.slice(start, j);
  };

  /** Reads a `{...}` argument as raw text (used for env names and \operatorname). */
  const readBracedText = (cmdStart: number): string => {
    while (src.charAt(i) === ' ') i++;
    if (src.charAt(i) !== '{') {
      throw new MathError('Expected "{" after command', { start: cmdStart, end: i });
    }
    let depth = 0;
    let close = i;
    for (; close < src.length; close++) {
      const ch = src.charAt(close);
      if (ch === '\\') close++;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) break;
    }
    if (close >= src.length) throw new MathError('Missing "}"', { start: i, end: src.length });
    // MathLive re-serializes a typed \operatorname{erf} as \operatorname{\mathrm{erf}} once
    // something follows it; unwrap such nested style commands.
    const text = src
      .slice(i + 1, close)
      .replace(/\\(?:mathrm|text|textrm|mathit|mathsf)\s*\{([^{}]*)\}/g, '$1');
    i = close + 1;
    return text;
  };

  const pushDelim = (d: Delim | 'pipe', start: number) => {
    const span = { start: sizing ? sizingStart : start, end: i };
    if (d === 'pipe') {
      const role: PipeRole = sizing === 'left' ? 'open' : sizing === 'right' ? 'close' : 'either';
      push({ kind: 'pipe', role, span });
    } else {
      push({ kind: 'delim', delim: d, sized: sizing !== null, span });
    }
    sizing = null;
  };

  while (i < src.length) {
    const start = i;
    const c = src.charAt(i);

    if (c === ' ' || c === '\t' || c === '\n' || c === '~') {
      i++;
      continue;
    }

    if (sizing && c !== '\\') {
      // \left( \right) \left. etc.
      i++;
      if (c === '.') {
        sizing = null; // invisible delimiter
        continue;
      }
      const d: Delim | 'pipe' | undefined =
        c === '|' ? 'pipe' : '()[]'.includes(c) ? (c as Delim) : undefined;
      if (!d) throw new MathError(`Unsupported delimiter "${c}"`, { start: sizingStart, end: i });
      pushDelim(d, start);
      continue;
    }

    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src.charAt(i + 1)))) {
      let j = i;
      while (j < src.length && /[0-9]/.test(src.charAt(j))) j++;
      if (src.charAt(j) === '.' && /[0-9]/.test(src.charAt(j + 1))) {
        j++;
        while (j < src.length && /[0-9]/.test(src.charAt(j))) j++;
      }
      push({ kind: 'num', value: src.slice(i, j), span: { start: i, end: j } });
      i = j;
      continue;
    }

    if (/[A-Za-z]/.test(c)) {
      i++;
      push({ kind: 'letter', name: c, span: { start, end: i } });
      continue;
    }

    if (c === '\\') {
      if (src.charAt(i + 1) === '\\') {
        i += 2;
        push({ kind: 'rowsep', span: { start, end: i } });
        continue;
      }
      const name = readCommandName();
      const span = () => ({ start, end: i });

      if (name === 'left' || name === 'right' || name === 'mleft' || name === 'mright') {
        sizing = name === 'left' || name === 'mleft' ? 'left' : 'right';
        sizingStart = start;
        continue;
      }
      const delimCmd = DELIM_COMMANDS[name];
      if (delimCmd !== undefined) {
        pushDelim(delimCmd, start);
        continue;
      }
      if (sizing) throw new MathError(`Unsupported delimiter "\\${name}"`, span());
      if (IGNORED.has(name)) continue;
      if (GREEK.has(name)) {
        push({ kind: 'letter', name: `\\${name}`, span: span() });
        continue;
      }
      if (FUNCTION_COMMANDS.has(name)) {
        push({ kind: 'fn', name, span: span() });
        continue;
      }
      const op = SIMPLE_OPS[name];
      if (op) {
        push({ kind: 'op', op, span: span() });
        continue;
      }
      const rel = RELATIONS[name];
      if (rel) {
        push({ kind: 'rel', op: rel, span: span() });
        continue;
      }
      const special = SPECIALS[name];
      if (special) {
        push({ kind: 'special', id: special, span: span() });
        continue;
      }
      if (TEXT_NAME_COMMANDS.has(name)) {
        const text = readBracedText(start).replace(/\s+/g, '');
        if (!/^[A-Za-z]+$/.test(text)) {
          throw new MathError(`Unsupported name "${text}"`, span());
        }
        if (name === 'operatorname') {
          // Always an operator name, even a single letter: \operatorname{S}(x) is Fresnel S.
          push({ kind: 'opname', name: text, operator: true, span: span() });
        } else {
          push(
            text.length === 1
              ? { kind: 'letter', name: text, span: span() }
              : { kind: 'opname', name: text, span: span() },
          );
        }
        continue;
      }
      if (name === 'begin' || name === 'end') {
        const env = readBracedText(start);
        push({ kind: 'env', which: name, env, span: span() });
        continue;
      }
      if (name === 'placeholder') {
        if (src.charAt(i) === '[') i = src.indexOf(']', i) + 1 || src.length;
        readBracedText(start);
        push({ kind: 'placeholder', span: span() });
        continue;
      }
      if (name === 'prime') {
        push({ kind: 'prime', span: span() });
        continue;
      }
      // Multi-prime glyphs (MathLive's default for typing '' is \doubleprime).
      const primeCount = { doubleprime: 2, tripleprime: 3, qprime: 4 }[name];
      if (primeCount) {
        for (let k = 0; k < primeCount; k++) push({ kind: 'prime', span: span() });
        continue;
      }
      if (name === 'to' || name === 'rightarrow' || name === 'longrightarrow') {
        push({ kind: 'to', span: span() });
        continue;
      }
      // Differentials: \differentialD (MathLive's upright d) is the letter d; \partial is ∂.
      if (name === 'differentialD') {
        push({ kind: 'letter', name: 'd', span: span() });
        continue;
      }
      if (name === 'partial') {
        push({ kind: 'letter', name: '\\partial', span: span() });
        continue;
      }
      if (name === '%') {
        push({ kind: 'percent', span: span() });
        continue;
      }
      if (
        ['frac', 'dfrac', 'tfrac', 'cfrac', 'sqrt', 'binom', 'int', 'sum', 'prod'].includes(name)
      ) {
        push({ kind: 'cmd', name: name.endsWith('frac') ? 'frac' : name, span: span() });
        continue;
      }
      throw new MathError(`Unknown command "\\${name}"`, span());
    }

    i++;
    const span = { start, end: i };
    switch (c) {
      case '+':
      case '-':
      case '*':
      case '/':
        push({ kind: 'op', op: c, span });
        break;
      case '=':
      case '<':
      case '>':
        push({ kind: 'rel', op: c, span });
        break;
      case '(':
      case ')':
      case '[':
      case ']':
      case '{':
      case '}':
        push({ kind: 'delim', delim: c, sized: false, span });
        break;
      case '|':
        push({ kind: 'pipe', role: 'either', span });
        break;
      case '_':
        push({ kind: 'sub', span });
        break;
      case '^':
        push({ kind: 'sup', span });
        break;
      case ',':
        push({ kind: 'comma', span });
        break;
      case '&':
        push({ kind: 'amp', span });
        break;
      case '!':
        push({ kind: 'bang', span });
        break;
      case "'":
        push({ kind: 'prime', span });
        break;
      default:
        throw new MathError(`Unexpected character "${c}"`, span);
    }
  }
  if (sizing) {
    throw new MathError('Missing delimiter after \\left or \\right', {
      start: sizingStart,
      end: src.length,
    });
  }
  push({ kind: 'eof', span: { start: src.length, end: src.length } });
  return tokens;
}
