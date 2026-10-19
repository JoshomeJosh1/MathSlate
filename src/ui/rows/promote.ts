import type { CasValue } from '../../cas/types';
import { printName } from '../../parser/printLatex';

/**
 * The value as shown: with `decimals` (the header's "Decimals" switch), each exact number that has
 * a decimal approximation is replaced by it (π/2 → 1.5707963267949); symbolic results stay.
 * Copying and "copy to a new row" use what is shown.
 */
export function shownValue(value: CasValue, decimals: boolean): CasValue {
  if (!decimals) return value;
  switch (value.kind) {
    case 'expr':
      return value.numeric ? { kind: 'expr', ...value.numeric, numeric: null } : value;
    case 'solutions':
      return {
        ...value,
        solutions: value.solutions.map((s) => (s.numeric ? { ...s.numeric, numeric: null } : s)),
      };
    case 'boolean':
      return value;
  }
}

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
