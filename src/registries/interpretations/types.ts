import type { ConstantId } from '../../parser/ast';

/** What an undefined symbol is taken to mean. */
export type Meaning =
  | { kind: 'constant'; id: ConstantId }
  /** Subscripted use is a term of a built-in sequence (see registries/builtins/sequences). */
  | { kind: 'sequence'; sequence: string }
  /** Just an ordinary symbolic variable. */
  | { kind: 'variable' };

export interface InterpretationOption {
  id: string;
  /** Short label for the prompt button and the row badge, e.g. "imaginary unit". */
  label: string;
  meaning: Meaning;
}

/**
 * Default meaning for a symbol the user has not defined, e.g. `i` → imaginary unit or `p_n` →
 * primes. A user definition of the symbol always takes precedence. The user's choice is stored
 * per document in `Doc.interpretations[symbol] = optionId`.
 */
export interface Interpretation {
  /** Symbol key: 'i', 'e', '\\pi', 'p'. */
  symbol: string;
  /**
   * 'bare': applies to the symbol on its own (`e`, `i`).
   * 'subscripted': applies only with a subscript (`p_5`); a bare `p` stays a variable.
   */
  form: 'bare' | 'subscripted';
  /** Prompt shown the first time the symbol is used, e.g. "Use i as the imaginary unit?". */
  question: string;
  options: readonly InterpretationOption[];
  defaultOption: string;
  /** False for unambiguous symbols like \pi: apply the default silently. */
  promptOnFirstUse: boolean;
}
