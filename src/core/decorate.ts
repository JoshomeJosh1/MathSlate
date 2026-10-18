import type { NameOccurrence } from '../parser/resolve';
import type { RowAnalysis } from './analyze';

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
  // An explicit \operatorname{…} typed (or pasted) by the user is left alone.
  if (current.startsWith('\\operatorname')) return null;
  switch (n.known) {
    case 'user':
      return `\\mathrm{${n.key}}`;
    case 'builtin':
      return current.startsWith('\\') ? null : `\\operatorname{${n.key}}`;
    case 'none':
      return /^\\mathrm\{[A-Za-z]+\}$/.test(current) ? n.key : null;
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

/** Inline shortcuts so typing a defined multi-letter name turns it upright immediately. */
export function nameShortcuts(analyses: Iterable<RowAnalysis>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of analyses) {
    const base = a.defines?.replace(/_\{.*\}$/, '');
    if (base && /^[A-Za-z]{2,}$/.test(base)) out[base] = `\\mathrm{${base}}`;
  }
  return out;
}
