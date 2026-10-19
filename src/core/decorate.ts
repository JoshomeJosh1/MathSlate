import { GREEK, LATEX_FUNCTION_COMMANDS } from '../parser/lexer';
import type { NameOccurrence } from '../parser/resolve';
import { builtinFunctions, type BuiltinFunction } from '../registries/builtins/functions';
import type { RowAnalysis } from './analyze';
import { needsBrackets } from './builtinScope';

/**
 * Upright display of recognised multi-letter names. A defined name is written `\mathrm{speed}`
 * (rendered upright), a built-in function typed as letters becomes `\operatorname{lcm}`, and a
 * `\mathrm{…}` name that is no longer defined goes back to plain (italic) letters, so "upright"
 * always means "recognised". Only the LaTeX spelling changes; the meaning is the same.
 *
 * Pure and idempotent: decorating already-decorated LaTeX returns it unchanged.
 */
export function decorateLatex(latex: string, names: readonly NameOccurrence[]): string {
  const edits: { start: number; end: number; text: string }[] = [];
  for (const n of names) {
    const current = latex.slice(n.span.start, n.span.end);
    let desired = desiredSpelling(n, current);
    // An integral's dx is set off from the integrand by a thin space: x^2\,dx.
    if (desired && n.key === 'dx' && !/\\[,;: ]\s*$/.test(latex.slice(0, n.span.start))) {
      desired = `\\,${desired}`;
    }
    if (desired !== null && desired !== current) {
      edits.push({ start: n.span.start, end: n.span.end, text: desired });
    }
  }
  // Apply right to left so earlier spans stay valid; skip overlaps (first one wins).
  edits.sort((a, b) => b.start - a.start);
  let out = latex;
  let limit = Infinity;
  for (const e of edits) {
    if (e.end > limit) continue;
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    limit = e.start;
  }
  return out;
}

function desiredSpelling(n: NameOccurrence, current: string): string | null {
  // Upright spellings of a multi-letter name: \mathrm{speed}, \operatorname{lcm} (also MathLive's
  // \operatorname{\mathrm{lc}\mathrm{m}} after editing inside it) and \lcm.
  const upright = /^\\(?:mathrm|operatorname\{|[A-Za-z]+$)/.test(current);
  switch (n.known) {
    case 'user':
      return `\\mathrm{${n.key}}`;
    case 'builtin':
      // Built-in functions are commands, which the editor shows as one unit (see functionMacros).
      return /^\\[A-Za-z]+$/.test(current) ? null : functionLatex(n.key);
    case 'none':
      return upright ? n.key : null;
    case 'subscript':
      return `\\mathrm{${n.key}}`;
    case 'differential':
      // A plain d becomes upright; \mathrm{d}, \differentialD and \partial are left as they are.
      return current === 'd' ? '\\mathrm{d}' : null;
  }
}

/** The decorated LaTeX for a row, or null if it needs no change (or the analysis is stale). */
export function decoratedRow(latex: string, analysis: RowAnalysis | undefined): string | null {
  if (!analysis || analysis.latex !== latex) return null;
  const next = decorateLatex(latex, analysis.names);
  return next === latex ? null : next;
}

/**
 * How a built-in function is written in an input row: as a command, `\sin` or `\lcm`, which the
 * editor displays as a single unit (you cannot type inside it). Names that are also Greek
 * letters (gamma, zeta) stay `\operatorname{…}`.
 */
export function functionLatex(name: string): string {
  return GREEK.has(name) ? `\\operatorname{${name}}` : `\\${name}`;
}

const multiLetterFunctions = () =>
  [...builtinFunctions.values()].filter((f) => /^[A-Za-z]{2,}$/.test(f.name));

/** A function's name and its other spellings (arcosh, arccosh). */
const spellings = (f: BuiltinFunction) => [f.name, ...(f.aliases ?? [])];

/**
 * Editor macros for the built-in function commands LaTeX itself does not define (`\lcm`,
 * `\artanh`, `\erf`, …), each displayed as an upright operator name.
 */
export function functionMacros(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of multiLetterFunctions().flatMap(spellings)) {
    if (!LATEX_FUNCTION_COMMANDS.has(name) && !GREEK.has(name)) {
      out[name] = `\\operatorname{${name}}`;
    }
  }
  return out;
}

/**
 * Inline shortcuts for the built-in functions, so typing "sinh", "lcm" or "erf" turns upright
 * at once. Names that are Greek letters (gamma, zeta) keep their Greek shortcut.
 */
export function functionShortcuts(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of multiLetterFunctions().flatMap(spellings)) {
    if (!GREEK.has(name)) out[name] = functionLatex(name);
  }
  return out;
}

/**
 * Function shortcuts that only stand when brackets follow (special functions; lcm, gcd,
 * binomial: two or more arguments). Without brackets their letters keep their ordinary meaning
 * (Si = S·i), so the editor turns them back into letters when anything else is typed.
 */
export function bracketOnlyShortcuts(): Set<string> {
  return new Set(
    multiLetterFunctions()
      .filter(needsBrackets)
      .flatMap(spellings)
      .filter((name) => !GREEK.has(name)),
  );
}

/** Inline shortcuts so typing a defined multi-letter name turns it upright immediately. */
export function nameShortcuts(analyses: Iterable<RowAnalysis>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of analyses) {
    const base = a.defines?.replace(/_\{.*\}$/, '');
    if (base && /^[A-Za-z]{2,}$/.test(base)) out[base] = `\\mathrm{${base}}`;
  }
  return out;
}
