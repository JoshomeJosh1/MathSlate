import type { CasValue } from '../../cas/types';
import { printName } from '../../parser/printLatex';

/** LaTeX rows that "copy to input" inserts; empty if the result is not re-parseable. */
export function promotableLatex(value: CasValue | undefined): string[] {
  if (!value) return [];
  switch (value.kind) {
    case 'expr':
      return value.expr ? [value.latex] : [];
    case 'solutions':
      return value.solutions.every((s) => s.expr)
        ? value.solutions.map((s) => `${printName(value.variable)}=${s.latex}`)
        : [];
    case 'boolean':
      return [];
  }
}
