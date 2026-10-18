import { makeName, type Name } from './ast';
import type { Cst } from './cst';
import type { Span } from './errors';

/**
 * Recognises definitions purely from the shape of a row's top-level `lhs = rhs`, before any
 * name resolution (so there is no circularity between rows):
 *
 *   a = …, speed = …, v_{max} = …   → constant
 *   f(x) = …, g(x, y) = …           → function
 *   a_n = …                         → sequence, if n occurs in the RHS or `a` has base cases
 *   a_1 = …                         → sequence base case if `a` is a sequence, else the name a_1
 */
export type DefinitionHead =
  | { kind: 'const'; name: Name; nameSpan: Span }
  | { kind: 'func'; name: Name; params: Name[]; nameSpan: Span }
  /** a_n = … ; `usesIndex` records whether the RHS mentions the index letter. */
  | { kind: 'seq'; name: Name; indexVar: Name; usesIndex: boolean; nameSpan: Span }
  | { kind: 'seqBase'; name: Name; index: number; nameSpan: Span };

export interface DefinitionShape {
  head: DefinitionHead;
  rhs: Cst;
  /** Source span of the defined name's base (without subscript), e.g. `speed` in `speed_1 = …`. */
  baseSpan: Span | null;
}

/** Extracts the raw head; `seq` vs. named-constant ambiguity is settled by `settleHeads`. */
export function definitionShape(cst: Cst | null): DefinitionShape | null {
  if (cst?.type !== 'relation' || cst.ops.length !== 1 || cst.ops[0] !== '=') return null;
  const [lhs, rhs] = cst.operands;
  if (!lhs || !rhs) return null;

  const plain = plainName(lhs);
  if (plain) {
    return {
      head: { kind: 'const', name: plain, nameSpan: lhs.span },
      rhs,
      baseSpan: nameBaseSpan(lhs),
    };
  }

  // a_n or a_5
  if (lhs.type === 'sub') {
    const base = plainName(lhs.base);
    if (base && base.sub === undefined) {
      const index = integerValue(lhs.sub);
      if (index !== null) {
        return {
          head: { kind: 'seqBase', name: base, index, nameSpan: lhs.span },
          rhs,
          baseSpan: nameBaseSpan(lhs.base),
        };
      }
      const indexVar = lhs.sub.type === 'letter' ? makeName(lhs.sub.name) : null;
      if (indexVar) {
        const usesIndex = mentionsLetter(rhs, indexVar.base);
        return {
          head: { kind: 'seq', name: base, indexVar, usesIndex, nameSpan: lhs.span },
          rhs,
          baseSpan: nameBaseSpan(lhs.base),
        };
      }
    }
  }

  // f(x), g(x,y), speed(t): juxtaposition of a name and a parenthesised parameter list
  if (lhs.type === 'juxt') {
    const last = lhs.items[lhs.items.length - 1];
    const prefix = lhs.items.slice(0, -1);
    if (last?.type === 'group' && last.delim === 'paren' && prefix.length > 0) {
      const fnCst = prefix.length === 1 && prefix[0] ? prefix[0] : { ...lhs, items: prefix };
      const fn = plainName(fnCst, true);
      const params = last.items.map((p) => plainName(p, true));
      if (fn && params.length > 0 && params.every((p): p is Name => p !== null)) {
        const keys = new Set(params.map((p) => `${p.base}_${p.sub ?? ''}`));
        if (keys.size === params.length) {
          return {
            head: { kind: 'func', name: fn, params, nameSpan: lhs.span },
            rhs,
            baseSpan: nameBaseSpan(fnCst),
          };
        }
      }
    }
  }
  return null;
}

/**
 * Resolves `a_n = …` (sequence or the constant named a_n?) and `a_1 = …` (base case or the
 * constant named a_1?) using all rows' heads together.
 */
export function settleHeads(heads: (DefinitionHead | null)[]): (DefinitionHead | null)[] {
  const baseCaseNames = new Set(heads.flatMap((h) => (h?.kind === 'seqBase' ? [h.name.base] : [])));
  const settledSeq = heads.map((h) => {
    if (h?.kind !== 'seq') return h;
    if (h.usesIndex || baseCaseNames.has(h.name.base)) return h;
    return {
      kind: 'const' as const,
      name: makeName(h.name.base, h.indexVar.base),
      nameSpan: h.nameSpan,
    };
  });
  const sequences = new Set(settledSeq.flatMap((h) => (h?.kind === 'seq' ? [h.name.base] : [])));
  return settledSeq.map((h) => {
    if (h?.kind !== 'seqBase' || sequences.has(h.name.base)) return h;
    return {
      kind: 'const' as const,
      name: makeName(h.name.base, String(h.index)),
      nameSpan: h.nameSpan,
    };
  });
}

/**
 * A CST that spells a single identifier: a letter, an upright \operatorname, a run of Latin
 * letters (`speed`), optionally with a simple subscript on the last letter (`v_{max}`, `x_1`).
 */
export function plainName(cst: Cst, allowIndexLikeSub = false): Name | null {
  switch (cst.type) {
    case 'letter':
    case 'opname':
      return makeName(cst.name);
    case 'juxt': {
      // A run of letters and upright names: s p e e d, or \mathrm{speed} y (= speedy).
      const items = cst.items;
      const last = items[items.length - 1];
      const init = items.slice(0, -1);
      if (items.every(isNamePart)) return makeName(items.map(namePartText).join(''));
      // Allow a subscript on the last part: s p e e d _1
      if (last?.type === 'sub' && init.every(isNamePart) && isNamePart(last.base)) {
        const sub = subscriptText(last.sub);
        return sub !== null ? makeName([...init, last.base].map(namePartText).join(''), sub) : null;
      }
      return null;
    }
    case 'sub': {
      const base = plainName(cst.base);
      const sub = subscriptText(cst.sub);
      // A bare `a_n` (single-letter subscript) is ambiguous; definitionShape handles it.
      if (!base || base.sub !== undefined || sub === null) return null;
      if (!allowIndexLikeSub && (cst.sub.type === 'letter' || integerValue(cst.sub) !== null)) {
        return null;
      }
      return makeName(base.base, sub);
    }
    default:
      return null;
  }
}

function isNamePart(c: Cst): boolean {
  return (
    (c.type === 'letter' && /^[A-Za-z]$/.test(c.name)) ||
    (c.type === 'opname' && /^[A-Za-z]+$/.test(c.name))
  );
}

function namePartText(c: Cst): string {
  return c.type === 'letter' || c.type === 'opname' ? c.name : '';
}

/** Span of the base of a name CST (letters/upright parts, excluding a trailing subscript). */
export function nameBaseSpan(cst: Cst): Span | null {
  switch (cst.type) {
    case 'letter':
    case 'opname':
      return cst.span;
    case 'sub':
      return nameBaseSpan(cst.base);
    case 'juxt': {
      const first = cst.items[0];
      const last = cst.items[cst.items.length - 1];
      if (!first || !last) return null;
      const end = last.type === 'sub' ? last.base.span.end : last.span.end;
      return { start: first.span.start, end };
    }
    default:
      return null;
  }
}

/** Text of a subscript that can be part of a name: letters/digits only (`1`, `max`, `ij`). */
export function subscriptText(cst: Cst): string | null {
  switch (cst.type) {
    case 'letter':
    case 'opname':
      return cst.name;
    case 'num':
      return /^[0-9]+$/.test(cst.value) ? cst.value : null;
    case 'fnapp':
      // `v_{\max}`: MathLive turns typed "max" into \max.
      return cst.arg || cst.sub || cst.power ? null : cst.name;
    case 'juxt': {
      const parts = cst.items.map(subscriptText);
      return parts.every((p): p is string => p !== null) ? parts.join('') : null;
    }
    default:
      return null;
  }
}

export function integerValue(cst: Cst): number | null {
  if (cst.type === 'num' && /^[0-9]+$/.test(cst.value)) return Number(cst.value);
  if (cst.type === 'neg' && cst.arg.type === 'num' && /^[0-9]+$/.test(cst.arg.value)) {
    return -Number(cst.arg.value);
  }
  return null;
}

function mentionsLetter(cst: Cst, letter: string): boolean {
  if (cst.type === 'letter') return cst.name === letter;
  return children(cst).some((c) => mentionsLetter(c, letter));
}

export function children(cst: Cst): Cst[] {
  switch (cst.type) {
    case 'num':
    case 'letter':
    case 'opname':
    case 'special':
      return [];
    case 'sub':
      return [cst.base, cst.sub];
    case 'pow':
      return [cst.base, cst.exp];
    case 'prime':
      return [cst.base];
    case 'group':
    case 'juxt':
      return cst.items;
    case 'binary':
      return [cst.left, cst.right];
    case 'neg':
    case 'factorial':
    case 'percent':
    case 'abs':
      return [cst.arg];
    case 'frac':
      return [cst.num, cst.den];
    case 'sqrt':
      return cst.index ? [cst.arg, cst.index] : [cst.arg];
    case 'binom':
      return [cst.n, cst.k];
    case 'matrix':
      return cst.rows.flat();
    case 'fnapp':
      return [cst.sub, cst.power, cst.arg].filter((c): c is Cst => c !== undefined);
    case 'relation':
      return cst.operands;
  }
}
