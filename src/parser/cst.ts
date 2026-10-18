import type { Span } from './errors';
import type { RelSymbol, SpecialId } from './lexer';

/**
 * Concrete syntax tree: the structure of one row's LaTeX, before names are resolved.
 *
 * Deliberately undecided about meaning: `xy` is a `juxt` of two letters (product? one name?),
 * `f(x)` is a `juxt` of a letter and a group (call? product?), `a_n` is a `sub` (name? sequence
 * term?). The resolver decides using the document's symbol table.
 */
export type Cst =
  | { type: 'num'; value: string; span: Span }
  | { type: 'letter'; name: string; span: Span } // x, \alpha
  | { type: 'opname'; name: string; span: Span } // \operatorname{gcd}, or a bare \max with no argument
  | { type: 'special'; id: SpecialId; span: Span }
  | { type: 'sub'; base: Cst; sub: Cst; span: Span }
  | { type: 'pow'; base: Cst; exp: Cst; span: Span }
  | { type: 'prime'; base: Cst; count: number; span: Span }
  | { type: 'group'; delim: GroupDelim; items: Cst[]; span: Span }
  | { type: 'juxt'; items: Cst[]; span: Span }
  | { type: 'binary'; op: BinaryOp; form?: MulForm; left: Cst; right: Cst; span: Span }
  | { type: 'neg'; arg: Cst; span: Span }
  | { type: 'factorial'; arg: Cst; span: Span }
  | { type: 'percent'; arg: Cst; span: Span }
  | { type: 'frac'; num: Cst; den: Cst; span: Span }
  | { type: 'sqrt'; arg: Cst; index?: Cst; span: Span }
  | { type: 'binom'; n: Cst; k: Cst; span: Span }
  | { type: 'abs'; arg: Cst; span: Span }
  | { type: 'matrix'; env: string; rows: Cst[][]; span: Span }
  /** LaTeX operator like \sin or \log_2, with optional power (\sin^2 x). `arg` absent = bare name. */
  | { type: 'fnapp'; name: string; sub?: Cst; power?: Cst; arg?: Cst; span: Span }
  | { type: 'relation'; ops: RelSymbol[]; operands: Cst[]; span: Span }
  /** \int f\,dx or \int_a^b f\,dx; `variable` is the letter after the differential. */
  | {
      type: 'integral';
      integrand: Cst;
      variable: Cst;
      lower?: Cst;
      upper?: Cst;
      /** Where the differential's "d" is, so it can be shown upright. */
      dSpan?: Span;
      span: Span;
    }
  /** \frac{d}{dx} f, \frac{d^2}{dx^2} f, \frac{dy}{dx}, \frac{\partial}{\partial x} f */
  | {
      type: 'deriv';
      operand: Cst;
      variable: Cst;
      order: number;
      partial: boolean;
      /** Where the "d"s of d/dx are, so they can be shown upright. */
      dSpans: Span[];
      span: Span;
    }
  /** \lim_{x\to a} f, with optional one-sided approach a^{+} / a^{-} */
  | { type: 'limit'; operand: Cst; variable: Cst; point: Cst; direction?: '+' | '-'; span: Span }
  /** \sum_{n=a}^{b} f, \prod_{n=a}^{b} f */
  | {
      type: 'bigop';
      op: 'sum' | 'prod';
      index: Cst;
      lower: Cst;
      upper: Cst;
      operand: Cst;
      span: Span;
    }
  /** A lone + or − in a script, as in a one-sided limit point 0^{+}. */
  | { type: 'sign'; sign: '+' | '-'; span: Span };

export type GroupDelim = 'paren' | 'bracket' | 'set';
export type BinaryOp = 'add' | 'sub' | 'mul' | 'div';
/** How a multiplication was written; lets backends treat \cdot / \times on vectors as dot / cross. */
export type MulForm = 'juxt' | 'cdot' | 'times' | 'star';
