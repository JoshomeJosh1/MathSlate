import {
  makeName,
  nameKey,
  type ConstantId,
  type Expr,
  type Name,
  type RelOp,
  type Statement,
  type UnitFactor,
} from './ast';
import type { Cst } from './cst';
import type { DefinitionShape } from './definitions';
import { children, subscriptText } from './definitions';
import { MathError, spanOf, type Span } from './errors';
import { functionAliasKey } from './functionNames';
import { isCallable, isSequence, type SymbolInfo, type SymbolTable } from './symbols';
import { INLINE_MATRIX } from './parser';
import { printLatex } from './printLatex';
import { parseUnitText, unitText } from './units';

/**
 * CST → AST using a symbol table. This is where the context-dependent reading happens:
 *
 * - Letter runs use longest match against defined names (`speed`, `xy`, `cross`), otherwise
 *   split into single-letter variables multiplied together. Locals (function parameters) are
 *   never merged into longer names.
 * - `name_sub`: a defined subscripted name (`x_1`, `v_{max}`) wins; else if the base is a
 *   sequence it is a term (`a_{n-1}`, `p_5`); else it is a free subscripted variable.
 * - A callable name directly followed by `( … )` is a call; other names next to parentheses
 *   multiply: `f(x+1)` vs `x(x+1)`.
 */

/** What an undefined symbol means, as decided by the symbol-interpretation registry. */
export type InterpretedMeaning =
  { kind: 'constant'; id: ConstantId } | { kind: 'sequence' } | { kind: 'variable' };

export interface ResolveOptions {
  /**
   * Meaning for a symbol the document does not define: bare (`e`, `i`, `\pi`) or subscripted
   * (`p_5` → primes). `optionId` identifies the choice, recorded per row for prompts and badges.
   */
  interpret?: (
    symbol: string,
    form: 'bare' | 'subscripted',
  ) => { meaning: InterpretedMeaning; optionId: string } | undefined;
  /** Whether a unit symbol exists (`km`, `N`, `µs`); from the units registry. */
  isUnit?: (symbol: string) => boolean;
}

/**
 * Shorthand in the source to show in its proper form once the row is left: a unit in square
 * brackets (`[km]` → `\unit{km}`), a matrix typed inline (`[1, 2; 3, 4]` → a pmatrix).
 */
export interface Rewrite {
  span: Span;
  latex: string;
}

/** A multi-letter name in the source, and what it resolved to. */
export interface NameOccurrence {
  /** The name's base, e.g. 'speed' (subscripts are not included). */
  key: string;
  /** Source span of the base: the letter run or the \mathrm{…}/\operatorname{…} command. */
  span: Span;
  /**
   * 'user': defined in the document (or a local); 'builtin': a built-in function; 'none':
   * unknown; 'subscript': a multi-letter subscript that is part of a name (v_{max}), always
   * shown upright as typographic convention; 'differential': the d of dx / d/dx in recognised
   * calculus notation, shown upright.
   */
  known: 'user' | 'builtin' | 'none' | 'subscript' | 'differential';
}

export interface ResolvedRow {
  statement: Statement;
  /** Keys of non-local, non-builtin symbols this row reads (for the dependency graph). */
  refs: Set<string>;
  /** Interpretations applied while resolving: symbol → option id. */
  interpretations: Map<string, string>;
  /** Multi-letter names in the source, for upright display of recognised names. */
  names: NameOccurrence[];
  /** Shorthand to show in its proper form: units in brackets, inline matrices. */
  rewrites: Rewrite[];
}

export function resolveRow(
  cst: Cst | null,
  shape: DefinitionShape | null,
  table: SymbolTable,
  options: ResolveOptions = {},
): ResolvedRow {
  const r = new Resolver(options);
  const statement = r.statement(cst, shape, table);
  return {
    statement,
    refs: r.refs,
    interpretations: r.interpretations,
    names: r.names,
    rewrites: r.rewrites,
  };
}

/** Resolves a single expression (no definition handling). */
export function resolveExpr(cst: Cst, table: SymbolTable, options: ResolveOptions = {}): Expr {
  return new Resolver(options).expr(cst, table);
}

const SPECIAL_CONSTANTS = { exponentialE: 'e', imaginaryI: 'i', infinity: 'infinity' } as const;

type Wrapper =
  | { kind: 'pow'; exp: Cst; span: Span }
  | { kind: 'factorial'; span: Span }
  | { kind: 'percent'; span: Span }
  | { kind: 'prime'; count: number; span: Span };

/** One item of a juxtaposition with its postfix decorations peeled off. */
interface Factor {
  core: Cst;
  sub?: Cst;
  /** Outermost first. */
  wrappers: Wrapper[];
  span: Span;
}

class Resolver {
  readonly refs = new Set<string>();
  readonly interpretations = new Map<string, string>();
  readonly names: NameOccurrence[] = [];
  readonly rewrites: Rewrite[] = [];

  constructor(private readonly options: ResolveOptions) {}

  /** The factors of `\unit{…}` text; an error names an unknown symbol. */
  private unitFactors(text: string, span: Span): UnitFactor[] {
    const factors = parseUnitText(text, span);
    for (const f of factors) {
      if (this.options.isUnit && !this.options.isUnit(f.symbol)) {
        throw new MathError(`Unknown unit "${f.symbol}"`, span);
      }
    }
    return factors;
  }

  /** The target of `→`: `\unit{mi}` or `[mi]`. */
  private conversionTarget(cst: Cst): UnitFactor[] {
    if (cst.type === 'unit') return this.unitFactors(cst.text, cst.span);
    if (isUnitBrackets(cst)) return this.requiredUnit(cst, undefined);
    throw new MathError('Convert to a unit, e.g. → [km]', cst.span);
  }

  /**
   * Square brackets around one thing hold a unit: the unit, or an error that says what is wrong
   * with it. `before` is the factor the brackets multiply, if any (for the number-moving fix).
   */
  private requiredUnit(cst: Cst & { type: 'group' }, before: Factor | undefined): UnitFactor[] {
    const isUnit = this.options.isUnit ?? (() => true);
    const inner = cst.items[0];
    if (!inner)
      throw new MathError('Empty unit: write one inside the brackets, e.g. [km]', cst.span);
    // Nothing in it is a unit (x+1): square brackets were meant as grouping.
    if (!mentionsUnit(inner, isUnit)) throw new MathError(GROUPING, cst.span);
    const problem = unitProblem(inner);
    if (problem === 'number') {
      throw new MathError(`Numbers go before the unit${numberMoved(inner, before)}`, inner.span);
    }
    if (problem) throw new MathError(problem, problem === GROUPING ? cst.span : inner.span);
    const text = unitTextOf(inner);
    if (text === null) throw new MathError(GROUPING, cst.span);
    const factors = parseUnitText(text, inner.span);
    for (const f of factors) {
      if (!isUnit(f.symbol)) {
        const guess = suggestUnit(f.symbol, isUnit);
        throw new MathError(
          `Unknown unit "${f.symbol}"${guess ? `. Did you mean ${guess}?` : ''}`,
          inner.span,
        );
      }
    }
    this.rewrites.push({ span: cst.span, latex: `\\unit{${unitText(factors)}}` });
    return factors;
  }

  statement(cst: Cst | null, shape: DefinitionShape | null, table: SymbolTable): Statement {
    if (!cst) return { kind: 'empty' };
    if (shape) {
      const { head, rhs } = shape;
      switch (head.kind) {
        case 'const': {
          const body = this.expr(rhs, table);
          return { kind: 'defConst', name: head.name, body, nameSpan: head.nameSpan };
        }
        case 'func': {
          const scope = table.withLocals(head.params.map(nameKey));
          const body = this.expr(rhs, scope);
          return {
            kind: 'defFunc',
            name: head.name,
            params: head.params,
            body,
            nameSpan: head.nameSpan,
          };
        }
        case 'seq': {
          const scope = table.withLocals([nameKey(head.indexVar)]);
          const body = this.expr(rhs, scope);
          return {
            kind: 'defSeq',
            name: head.name,
            indexVar: head.indexVar,
            body,
            nameSpan: head.nameSpan,
          };
        }
        case 'seqBase': {
          const body = this.expr(rhs, table);
          return {
            kind: 'defSeqBase',
            name: head.name,
            index: head.index,
            body,
            nameSpan: head.nameSpan,
          };
        }
      }
    }
    const expr = this.expr(cst, table);
    return expr.kind === 'relation' ? { kind: 'relation', expr } : { kind: 'expr', expr };
  }

  expr(cst: Cst, scope: SymbolTable): Expr {
    const span = cst.span;
    switch (cst.type) {
      case 'num':
        return { kind: 'num', value: cst.value, span };
      case 'special':
        return { kind: 'constant', id: SPECIAL_CONSTANTS[cst.id], span };
      case 'letter':
      case 'opname':
      case 'sub':
      case 'pow':
      case 'prime':
      case 'factorial':
      case 'percent':
        return this.juxtaposition([cst], scope, span);
      case 'juxt':
        return this.juxtaposition(cst.items, scope, span);
      case 'unit':
        return { kind: 'unit', factors: this.unitFactors(cst.text, span), span };
      case 'convert':
        return {
          kind: 'convert',
          expr: this.expr(cst.expr, scope),
          target: this.conversionTarget(cst.target),
          span,
        };
      case 'group': {
        // Square brackets around one thing hold a unit; with commas they are a list.
        if (isUnitBrackets(cst) && this.options.isUnit) {
          return { kind: 'unit', factors: this.requiredUnit(cst, undefined), span };
        }
        const items = cst.items.map((c) => this.expr(c, scope));
        if (cst.delim === 'paren' && items.length === 1 && items[0]) return items[0];
        return { kind: 'list', delim: cst.delim, items, span };
      }
      case 'binary': {
        const node: Expr = {
          kind: 'binary',
          op: cst.op,
          left: this.expr(cst.left, scope),
          right: this.expr(cst.right, scope),
          span,
        };
        if (cst.form) node.form = cst.form;
        return node;
      }
      case 'neg':
        return { kind: 'neg', arg: this.expr(cst.arg, scope), span };
      case 'frac':
        return {
          kind: 'binary',
          op: 'div',
          left: this.expr(cst.num, scope),
          right: this.expr(cst.den, scope),
          span,
        };
      case 'sqrt': {
        const arg = this.expr(cst.arg, scope);
        return cst.index
          ? { kind: 'root', arg, degree: this.expr(cst.index, scope), span }
          : { kind: 'root', arg, span };
      }
      case 'binom':
        return this.call(makeName('binomial'), [cst.n, cst.k], scope, span);
      case 'abs':
        return { kind: 'abs', arg: this.expr(cst.arg, scope), span };
      case 'matrix': {
        const node: Expr = {
          kind: 'matrix',
          rows: cst.rows.map((r) => r.map((c) => this.expr(c, scope))),
          span,
        };
        // [1, 2; 3, 4] is shown as the matrix it is once the row is left.
        if (cst.env === INLINE_MATRIX) this.rewrites.push({ span, latex: printLatex(node) });
        return node;
      }
      case 'fnapp':
        return this.functionApplication(cst, scope);
      case 'relation':
        return {
          kind: 'relation',
          ops: cst.ops satisfies RelOp[],
          operands: cst.operands.map((c) => this.expr(c, scope)),
          span,
        };
      case 'integral': {
        const variable = boundName(cst.variable);
        const inner = scope.withLocals([nameKey(variable)]);
        const node: Expr = {
          kind: 'integral',
          integrand: this.expr(cst.integrand, inner),
          variable,
          span,
        };
        if (cst.lower && cst.upper) {
          node.lower = this.expr(cst.lower, scope);
          node.upper = this.expr(cst.upper, scope);
        }
        return node;
      }
      case 'deriv': {
        const variable = boundName(cst.variable);
        return {
          kind: 'diff',
          operand: this.expr(cst.operand, scope.withLocals([nameKey(variable)])),
          variable,
          order: cst.order,
          partial: cst.partial,
          span,
        };
      }
      case 'limit': {
        const variable = boundName(cst.variable);
        const node: Expr = {
          kind: 'limit',
          operand: this.expr(cst.operand, scope.withLocals([nameKey(variable)])),
          variable,
          point: this.expr(cst.point, scope),
          span,
        };
        if (cst.direction) node.direction = cst.direction;
        return node;
      }
      case 'bigop': {
        const index = boundName(cst.index);
        return {
          kind: 'bigop',
          op: cst.op,
          operand: this.expr(cst.operand, scope.withLocals([nameKey(index)])),
          index,
          lower: this.expr(cst.lower, scope),
          upper: this.expr(cst.upper, scope),
          span,
        };
      }
      case 'sign':
        throw new MathError(`Unexpected "${cst.sign}"`, span);
    }
  }

  // ------------------------------------------------------------ juxtaposition & names

  private juxtaposition(items: Cst[], scope: SymbolTable, span: Span): Expr {
    const factors = this.mergeLetterRuns(items.map(unwrap), scope);
    const out: Expr[] = [];
    for (let k = 0; k < factors.length; k++) {
      const f = factors[k];
      if (!f) continue;
      if (f.core.type === 'letter' || f.core.type === 'opname') {
        const { expr, consumedNext } = this.named(f, f.core.name, factors[k + 1], scope);
        out.push(expr);
        if (consumedNext) k++;
      } else if (k > 0 && isUnitBrackets(f.core) && this.options.isUnit) {
        // Square brackets multiplied onto something (5[km], x[m]) always hold a unit.
        const unit: Expr = {
          kind: 'unit',
          factors: this.requiredUnit(f.core, factors[k - 1]),
          span: f.core.span,
        };
        out.push(this.applyWrappers(unit, f.wrappers, scope));
      } else {
        out.push(this.applyWrappers(this.expr(f.core, scope), f.wrappers, scope));
      }
    }
    const [first, ...rest] = out;
    if (!first) throw new MathError('Missing expression', span);
    return rest.reduce<Expr>(
      (left, right) => ({
        kind: 'binary',
        op: 'mul',
        form: 'juxt',
        left,
        right,
        span: spanOf(left.span, right.span),
      }),
      first,
    );
  }

  /** Longest-match merging of adjacent single Latin letters into defined multi-letter names. */
  private mergeLetterRuns(factors: Factor[], scope: SymbolTable): Factor[] {
    const out: Factor[] = [];
    let i = 0;
    while (i < factors.length) {
      const start = factors[i];
      if (!start) break;
      let merged: Factor | null = null;
      if (isLatinLetter(start) && !scope.isLocal(letterOf(start))) {
        const limit = Math.min(factors.length, i + scope.maxRunLength);
        for (let j = limit; j >= i + 2 && !merged; j--) {
          const run = factors.slice(i, j);
          const inner = run.slice(0, -1);
          const last = run[run.length - 1];
          if (!last || !run.every(isLatinLetter)) continue;
          if (!inner.every((f) => f.sub === undefined && f.wrappers.length === 0)) continue;
          const key = run.map(letterOf).join('');
          const subText = last.sub ? subscriptText(last.sub) : null;
          const found =
            (subText !== null && scope.lookup(nameKey(makeName(key, subText)))) ||
            scope.lookup(key);
          // Special functions only claim their letters when called: Si(x) yes, Si alone is S·i.
          const blocked = isCallable(found) && found.callOnly && !isParenGroup(factors[j]);
          if (found && !blocked) {
            merged = {
              core: { type: 'opname', name: key, span: spanOf(start.core.span, last.core.span) },
              wrappers: last.wrappers,
              span: spanOf(start.span, last.span),
            };
            if (last.sub) merged.sub = last.sub;
            i = j;
          }
        }
      }
      if (merged) {
        out.push(merged);
      } else {
        out.push(start);
        i++;
      }
    }
    return out;
  }

  private named(
    f: Factor,
    base: string,
    next: Factor | undefined,
    scope: SymbolTable,
  ): { expr: Expr; consumedNext: boolean } {
    const span = spanOf(f.core.span, f.sub?.span ?? f.core.span);
    if (f.core.type === 'opname' && f.core.command && !scope.lookup(base)) {
      throw new MathError(`Unknown command "\\${base}"`, f.core.span);
    }
    if (/^[A-Za-z]{2,}$/.test(base)) this.recordName(base, f, next, scope);
    // Special functions by their LaTeX spelling: \operatorname{S}(x), \operatorname{J}_{n}(x).
    if (f.core.type === 'opname' && f.core.operator) {
      const alias = scope.lookup(functionAliasKey(`\\operatorname{${base}}`, f.sub !== undefined));
      if (isCallable(alias) && isParenGroup(next)) {
        return this.finishName(makeName(base), alias, f, next, scope, span, f.sub);
      }
    }
    if (f.sub) {
      const subText = subscriptText(f.sub);
      if (subText !== null) {
        const full = makeName(base, subText);
        const info = scope.lookup(nameKey(full));
        if (info) {
          this.recordSubscript(f.sub, subText);
          return this.finishName(full, info, f, next, scope, span);
        }
      }
      const baseInfo = scope.lookup(base);
      // besselJ_0(x): a function whose first argument is written as a subscript.
      if (isCallable(baseInfo) && baseInfo.subscriptArg === 'first' && isParenGroup(next)) {
        return this.finishName(makeName(base), baseInfo, f, next, scope, span, f.sub);
      }
      const interpreted = baseInfo ? undefined : this.interpret(base, 'subscripted');
      if (isSequence(baseInfo) || interpreted?.kind === 'sequence') {
        if (baseInfo) this.ref(base, baseInfo);
        const node: Expr = {
          kind: 'index',
          seq: makeName(base),
          index: this.expr(f.sub, scope),
          span,
        };
        return { expr: this.applyWrappers(node, f.wrappers, scope), consumedNext: false };
      }
      if (subText === null) {
        throw new MathError(
          `"${displayName(base)}" is not a sequence, so its subscript must be letters or digits`,
          f.sub.span,
        );
      }
      const name = makeName(base, subText);
      this.recordSubscript(f.sub, subText);
      return this.finishName(name, undefined, f, next, scope, span);
    }
    return this.finishName(makeName(base), scope.lookup(base), f, next, scope, span);
  }

  private finishName(
    name: Name,
    symbol: SymbolInfo | undefined,
    f: Factor,
    next: Factor | undefined,
    scope: SymbolTable,
    span: Span,
    /** A subscript that is the function's first argument (J_n(x)). */
    leadingArg?: Cst,
  ): { expr: Expr; consumedNext: boolean } {
    const display = displayName(nameKey(name));
    // A special function without parentheses is just a name (\zeta alone is the variable ζ).
    const info = isCallable(symbol) && symbol.callOnly && !isParenGroup(next) ? undefined : symbol;
    if (info && isCallable(info)) {
      const primes = f.wrappers.filter((w): w is Wrapper & { kind: 'prime' } => w.kind === 'prime');
      const other = f.wrappers.find((w) => w.kind !== 'prime');
      if (other) {
        throw new MathError(
          `Write "(${display}(…))^n" to raise a function's value to a power`,
          other.span,
        );
      }
      if (next?.core.type !== 'group' || next.core.delim !== 'paren' || next.sub) {
        throw new MathError(`"${display}" is a function; write ${display}(…)`, span);
      }
      const argsCst = next.core.items;
      this.ref(nameKey(name), info);
      const callSpan = spanOf(span, next.core.span);
      let node: Expr;
      if (primes.length > 0) {
        if (info.kind !== 'function') {
          throw new MathError('Prime notation is only supported for your own functions', span);
        }
        const order = primes.reduce((n, p) => n + p.count, 0);
        node = {
          kind: 'derivative',
          fn: name,
          order,
          args: argsCst.map((c) => this.expr(c, scope)),
          span: callSpan,
        };
      } else {
        const fn = info.canonical ? makeName(info.canonical) : name;
        node = this.call(
          fn,
          leadingArg ? [leadingArg, ...argsCst] : argsCst,
          scope,
          callSpan,
          info,
        );
      }
      return { expr: this.applyWrappers(node, next.wrappers, scope), consumedNext: true };
    }
    if (isSequence(info)) {
      throw new MathError(`"${display}" is a sequence; write ${display}_{n}`, span);
    }
    let node: Expr;
    const interpreted = info ? undefined : this.interpret(nameKey(name), 'bare');
    if (interpreted?.kind === 'constant') {
      node = { kind: 'constant', id: interpreted.id, span };
    } else {
      if (info) this.ref(nameKey(name), info);
      node = { kind: 'var', name, span };
    }
    return { expr: this.applyWrappers(node, f.wrappers, scope), consumedNext: false };
  }

  private call(
    fn: Name,
    argsCst: Cst[],
    scope: SymbolTable,
    span: Span,
    info: SymbolInfo | undefined = scope.lookup(nameKey(fn)),
  ): Expr {
    const display = displayName(nameKey(fn));
    if (!info || !isCallable(info)) throw new MathError(`Unknown function "${display}"`, span);
    this.ref(nameKey(fn), info);
    const args = argsCst.map((c) => this.expr(c, scope));
    checkArity(display, info, args.length, span);
    return { kind: 'call', fn, args, span };
  }

  private functionApplication(cst: Cst & { type: 'fnapp' }, scope: SymbolTable): Expr {
    const span = cst.span;
    const info = scope.lookup(cst.name);
    if (!info || !isCallable(info)) {
      throw new MathError(`Unknown function "\\${cst.name}"`, span);
    }
    if (!cst.arg) throw new MathError(`"\\${cst.name}" needs an argument`, span);
    const argsCst =
      cst.arg.type === 'group' && cst.arg.delim === 'paren' ? [...cst.arg.items] : [cst.arg];
    if (cst.sub) {
      // \log_2 x → log(x, 2)
      if (!info.subscriptArg) {
        throw new MathError(`"\\${cst.name}" does not take a subscript`, cst.sub.span);
      }
      argsCst.push(cst.sub);
    }
    let name = makeName(cst.name);
    let callInfo: SymbolInfo = info;
    let power = cst.power;
    if (power && isMinusOne(power)) {
      // \sin^{-1} x → arcsin x
      const inverse = info.inverse;
      const inverseInfo = inverse ? scope.lookup(inverse) : undefined;
      if (inverse && inverseInfo) {
        name = makeName(inverse);
        callInfo = inverseInfo;
        power = undefined;
      }
    }
    const callNode = this.call(name, argsCst, scope, span, callInfo);
    return power
      ? { kind: 'binary', op: 'pow', left: callNode, right: this.expr(power, scope), span }
      : callNode;
  }

  private applyWrappers(node: Expr, wrappers: Wrapper[], scope: SymbolTable): Expr {
    let out = node;
    for (let k = wrappers.length - 1; k >= 0; k--) {
      const w = wrappers[k];
      if (!w) continue;
      const span = spanOf(out.span, w.span);
      switch (w.kind) {
        case 'pow':
          out = { kind: 'binary', op: 'pow', left: out, right: this.expr(w.exp, scope), span };
          break;
        case 'factorial':
          out = { kind: 'factorial', arg: out, span };
          break;
        case 'percent':
          out = {
            kind: 'binary',
            op: 'div',
            left: out,
            right: { kind: 'num', value: '100', span: w.span },
            span,
          };
          break;
        case 'prime':
          throw new MathError('Prime (′) can only follow a function name', w.span);
      }
    }
    return out;
  }

  /** A name's subscript of two or more letters (v_{max}) is shown upright. */
  private recordSubscript(sub: Cst, text: string): void {
    if (/^[A-Za-z]{2,}$/.test(text))
      this.names.push({ key: text, span: sub.span, known: 'subscript' });
  }

  private recordName(base: string, f: Factor, next: Factor | undefined, scope: SymbolTable): void {
    const subText = f.sub ? subscriptText(f.sub) : null;
    const found =
      (subText !== null ? scope.lookup(nameKey(makeName(base, subText))) : undefined) ??
      scope.lookup(base);
    // A call-only function without brackets is not that function (lcm alone is letters).
    const info = isCallable(found) && found.callOnly && !isParenGroup(next) ? undefined : found;
    const known = !info ? 'none' : info.kind === 'builtinFunction' ? 'builtin' : 'user';
    this.names.push({ key: base, span: f.core.span, known });
  }

  private interpret(symbol: string, form: 'bare' | 'subscripted'): InterpretedMeaning | undefined {
    const result = this.options.interpret?.(symbol, form);
    if (!result) return undefined;
    this.interpretations.set(symbol, result.optionId);
    return result.meaning;
  }

  private ref(key: string, info: SymbolInfo): void {
    if (info.kind === 'variable' || info.kind === 'function' || info.kind === 'sequence') {
      this.refs.add(key);
    }
  }
}

// ---------------------------------------------------------------- helpers

function unwrap(item: Cst): Factor {
  const wrappers: Wrapper[] = [];
  let node = item;
  for (;;) {
    if (node.type === 'pow') {
      wrappers.push({ kind: 'pow', exp: node.exp, span: node.exp.span });
      node = node.base;
    } else if (node.type === 'factorial' || node.type === 'percent') {
      wrappers.push({ kind: node.type, span: { start: node.arg.span.end, end: node.span.end } });
      node = node.arg;
    } else if (node.type === 'prime') {
      wrappers.push({
        kind: 'prime',
        count: node.count,
        span: { start: node.base.span.end, end: node.span.end },
      });
      node = node.base;
    } else {
      break;
    }
  }
  if (node.type === 'sub' && (node.base.type === 'letter' || node.base.type === 'opname')) {
    return { core: node.base, sub: node.sub, wrappers, span: item.span };
  }
  if (node.type === 'sub') {
    throw new MathError('A subscript must follow a name', node.sub.span);
  }
  return { core: node, wrappers, span: item.span };
}

const UNIT_GREEK: Partial<Record<string, string>> = { '\\mu': 'µ', '\\Omega': 'Ω' };

const GROUPING = 'Square brackets hold a unit, e.g. 5[km]; use ( ) to group';

/** Whether any letter run inside spells a unit (or a unit symbol on its own). */
function mentionsUnit(cst: Cst, isUnit: (s: string) => boolean): boolean {
  const own =
    cst.type === 'juxt' || cst.type === 'letter' || cst.type === 'opname' ? unitTextOf(cst) : null;
  if (own !== null && isUnit(own)) return true;
  if (cst.type === 'letter') return isUnit(UNIT_GREEK[cst.name] ?? cst.name);
  if (cst.type === 'opname' || cst.type === 'fnapp') return isUnit(cst.name);
  return children(cst).some((c) => mentionsUnit(c, isUnit));
}

/** Square brackets around one thing (not a list): a unit, or ordinary brackets. */
function isUnitBrackets(cst: Cst): cst is Cst & { type: 'group' } {
  return cst.type === 'group' && cst.delim === 'bracket' && cst.items.length <= 1;
}

/**
 * What stops the inside of unit brackets from being a unit: 'number' (numbers go before the
 * unit), a message, or null if it is made of the right parts (its symbols are checked later).
 */
function unitProblem(cst: Cst): string | null {
  switch (cst.type) {
    case 'num':
      return 'number';
    case 'letter':
    case 'opname':
      return null;
    case 'fnapp':
      return cst.arg || cst.sub || cst.power ? GROUPING : null;
    case 'juxt':
      return firstProblem(cst.items);
    case 'binary':
      if (cst.op === 'add' || cst.op === 'sub') {
        return `A unit can't contain "${cst.op === 'add' ? '+' : '−'}": multiply, divide or use powers, e.g. [kg·m/s^2]`;
      }
      return firstProblem([cst.left, cst.right]);
    case 'frac':
      return firstProblem([cst.num, cst.den]);
    case 'pow': {
      const base = unitProblem(cst.base);
      if (base) return base;
      const exp = cst.exp.type === 'neg' ? cst.exp.arg : cst.exp;
      return exp.type === 'num' && /^[0-9]+$/.test(exp.value)
        ? null
        : 'Unit powers must be whole numbers, e.g. [m^2] or [s^{-1}]';
    }
    case 'group':
      return cst.delim === 'paren' && cst.items.length === 1 && cst.items[0]
        ? unitProblem(cst.items[0])
        : GROUPING;
    case 'neg':
      return 'A unit cannot be negative: put the minus sign before the number';
    default:
      return GROUPING;
  }
}

function firstProblem(items: Cst[]): string | null {
  let number = false;
  for (const item of items) {
    const p = unitProblem(item);
    if (p === 'number') number = true;
    else if (p) return p;
  }
  return number ? 'number' : null;
}

/**
 * The fix for numbers inside unit brackets, when it is simple (numbers multiplying the unit's
 * numerator): 10[2A/s^2] → ": 20[A/s^2]". Empty otherwise.
 */
function numberMoved(inner: Cst, before: Factor | undefined): string {
  const numbers: number[] = [];
  const rest = (c: Cst): string | null => {
    if (c.type === 'num') {
      numbers.push(Number(c.value));
      return '';
    }
    if (c.type === 'juxt') {
      const parts = c.items.map(rest);
      return parts.every((p) => p !== null) ? parts.join('') : null;
    }
    if (c.type === 'binary' && c.op === 'mul') {
      const l = rest(c.left);
      const r = rest(c.right);
      return l === null || r === null ? null : [l, r].filter(Boolean).join('·');
    }
    return unitTextOf(c);
  };
  let text: string | null;
  if (inner.type === 'binary' && inner.op === 'div') {
    const numerator = rest(inner.left);
    const denominator = unitTextOf(inner.right);
    text = numerator && denominator ? `${numerator}/${denominator}` : null;
  } else if (inner.type === 'frac') {
    const numerator = rest(inner.num);
    const denominator = unitTextOf(inner.den);
    text = numerator && denominator ? `${numerator}/${denominator}` : null;
  } else {
    text = rest(inner);
  }
  if (!text || numbers.length === 0) return '';
  const outside =
    before && before.wrappers.length === 0 && before.core.type === 'num'
      ? Number(before.core.value)
      : 1;
  const amount = numbers.reduce((a, b) => a * b, outside);
  return `: ${String(Number(amount.toPrecision(15)))}[${text.replace(/\^\{(-?[0-9]+)\}/g, '^$1')}]`;
}

/**
 * A guess for an unknown unit symbol: the same letters in another case (Kg → kg, KM → km), or
 * two units run together (kmh → km/h, Nm → N·m: per time unit, else a product).
 */
function suggestUnit(symbol: string, isUnit: (s: string) => boolean): string | null {
  const guesses: string[] = [];
  const caseFix = [symbol.toLowerCase(), symbol.charAt(0) + symbol.slice(1).toLowerCase()].find(
    (c) => c !== symbol && isUnit(c),
  );
  if (caseFix) guesses.push(caseFix);
  const TIME = new Set(['s', 'min', 'h', 'd', 'yr', 'ms']);
  for (let k = 1; k < symbol.length; k++) {
    const a = symbol.slice(0, k);
    const b = symbol.slice(k);
    // Only readings people write: a rate (km/h) or a named unit times another (N·m, kW·h).
    const product = /^[a-zµ]{0,2}[NJWVACΩ]$/.test(a);
    if (isUnit(a) && isUnit(b) && (TIME.has(b) || product)) {
      guesses.push(TIME.has(b) && !product ? `${a}/${b}` : `${a}·${b}`);
      break;
    }
  }
  // Both can fit (Nm: nanometres or newton-metres), so offer both.
  return guesses.length > 0 ? guesses.join(' or ') : null;
}

/**
 * What the inside of square brackets says as unit text, if it is made only of letters, powers,
 * products and one quotient: `[km]` → km, `[m/s^2]` → m/(s^{2}), `[\mu m]` → µm. Null otherwise.
 */
function unitTextOf(cst: Cst): string | null {
  switch (cst.type) {
    case 'letter':
      return /^[A-Za-z]$/.test(cst.name) ? cst.name : (UNIT_GREEK[cst.name] ?? null);
    case 'opname':
      return cst.name;
    case 'fnapp':
      // [min]: the editor turned the letters into the function \min.
      return cst.arg || cst.sub || cst.power ? null : cst.name;
    case 'juxt': {
      const parts = cst.items.map(unitTextOf);
      return parts.every((p) => p !== null) ? parts.join('') : null;
    }
    case 'pow': {
      const base = unitTextOf(cst.base);
      const exp = cst.exp;
      const power =
        exp.type === 'num' && /^[0-9]+$/.test(exp.value)
          ? exp.value
          : exp.type === 'neg' && exp.arg.type === 'num' && /^[0-9]+$/.test(exp.arg.value)
            ? `-${exp.arg.value}`
            : null;
      return base !== null && power !== null ? `${base}^{${power}}` : null;
    }
    case 'binary': {
      if (cst.op !== 'mul' && cst.op !== 'div') return null;
      const left = unitTextOf(cst.left);
      const right = unitTextOf(cst.right);
      if (left === null || right === null) return null;
      return cst.op === 'mul' ? `${left} ${right}` : `${left}/(${right})`;
    }
    case 'group': {
      // J/(kg·K): the quotient adds the parentheses back.
      const only = cst.delim === 'paren' && cst.items.length === 1 ? cst.items[0] : undefined;
      return only ? unitTextOf(only) : null;
    }
    case 'frac': {
      const num = unitTextOf(cst.num);
      const den = unitTextOf(cst.den);
      return num !== null && den !== null ? `${num}/(${den})` : null;
    }
    default:
      return null;
  }
}

function isParenGroup(f: Factor | undefined): boolean {
  return f?.core.type === 'group' && f.core.delim === 'paren' && f.sub === undefined;
}

/** The variable of an integral, derivative, limit or sum: a single letter (Latin or Greek). */
function boundName(cst: Cst): Name {
  if (cst.type === 'letter') return makeName(cst.name);
  throw new MathError('Expected a single-letter variable', cst.span);
}

function isLatinLetter(f: Factor): boolean {
  return f.core.type === 'letter' && /^[A-Za-z]$/.test(f.core.name);
}

function letterOf(f: Factor): string {
  return f.core.type === 'letter' ? f.core.name : '';
}

function isMinusOne(c: Cst): boolean {
  return c.type === 'neg' && c.arg.type === 'num' && c.arg.value === '1';
}

function checkArity(display: string, info: SymbolInfo, count: number, span: Span): void {
  const [min, max] = info.arity ?? [1, 1];
  if (count >= min && count <= max) return;
  const expected =
    min === max ? `${min}` : max === Infinity ? `at least ${min}` : `${min} to ${max}`;
  throw new MathError(
    `"${display}" takes ${expected} argument${expected === '1' ? '' : 's'}, got ${count}`,
    span,
  );
}

/** Human-readable form of a symbol key for messages: `\alpha` → α-ish text stays LaTeX. */
export function displayName(key: string): string {
  return key.replace(/_\{([^}]*)\}/, '_$1');
}
