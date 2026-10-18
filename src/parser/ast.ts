import type { MulForm } from './cst';
import type { Span } from './errors';

/**
 * Resolved, CAS-agnostic abstract syntax tree. Every name here has been classified (variable,
 * function call, sequence term, constant) using the document's symbol table. Backends translate
 * this tree; nothing in it is specific to SymPy or any other CAS.
 */

/** An identifier: base is a Latin letter run (`x`, `speed`) or Greek command (`\alpha`). */
export interface Name {
  base: string;
  /** Subscript that is part of the name: `x_1` → '1', `v_{max}` → 'max'. */
  sub?: string;
}

/** Canonical string key for a name, used in symbol tables: `x`, `v_{max}`, `\alpha_{1}`. */
export function nameKey(name: Name): string {
  return name.sub === undefined ? name.base : `${name.base}_{${name.sub}}`;
}

export function makeName(base: string, sub?: string): Name {
  return sub === undefined ? { base } : { base, sub };
}

export type ConstantId = 'pi' | 'e' | 'i' | 'infinity';
export type BinaryOp = 'add' | 'sub' | 'mul' | 'div' | 'pow';
export type RelOp = '=' | '<' | '>' | '<=' | '>=' | '!=';

export type Expr =
  | { kind: 'num'; value: string; span: Span }
  | { kind: 'var'; name: Name; span: Span }
  | { kind: 'constant'; id: ConstantId; span: Span }
  | { kind: 'neg'; arg: Expr; span: Span }
  | { kind: 'binary'; op: BinaryOp; form?: MulForm; left: Expr; right: Expr; span: Span }
  | { kind: 'factorial'; arg: Expr; span: Span }
  /** Function call: user function, built-in function, or command used as a function. */
  | { kind: 'call'; fn: Name; args: Expr[]; span: Span }
  /** n-th derivative of a user function applied to args: f'(x). */
  | { kind: 'derivative'; fn: Name; order: number; args: Expr[]; span: Span }
  /** Sequence term: a_n, p_5, out_3. */
  | { kind: 'index'; seq: Name; index: Expr; span: Span }
  | { kind: 'matrix'; rows: Expr[][]; span: Span }
  | { kind: 'abs'; arg: Expr; span: Span }
  | { kind: 'root'; arg: Expr; degree?: Expr; span: Span }
  | { kind: 'list'; delim: 'paren' | 'bracket' | 'set'; items: Expr[]; span: Span }
  | { kind: 'relation'; ops: RelOp[]; operands: Expr[]; span: Span };

/** What a row means, after classification of its top-level `=`. */
export type Statement =
  | { kind: 'empty' }
  | { kind: 'expr'; expr: Expr }
  /** Equation or inequality that is not a definition: x^2 = 4, y < 2x. */
  | { kind: 'relation'; expr: Expr & { kind: 'relation' } }
  | { kind: 'defConst'; name: Name; body: Expr; nameSpan: Span }
  | { kind: 'defFunc'; name: Name; params: Name[]; body: Expr; nameSpan: Span }
  | { kind: 'defSeq'; name: Name; indexVar: Name; body: Expr; nameSpan: Span }
  | { kind: 'defSeqBase'; name: Name; index: number; body: Expr; nameSpan: Span };

export type Definition = Exclude<Statement, { kind: 'empty' | 'expr' | 'relation' }>;
