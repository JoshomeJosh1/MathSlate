import type { Interpretation, InterpretationOption, Meaning } from './types';

export type { Interpretation, InterpretationOption, Meaning } from './types';

// Every module in defs/ is picked up automatically (Vite resolves this glob at build time).
const modules = import.meta.glob<{ default: Interpretation }>('./defs/*.ts', { eager: true });

const byFormAndSymbol = new Map<string, Interpretation>(
  Object.values(modules).map((m) => [`${m.default.form}:${m.default.symbol}`, m.default]),
);

export const interpretations: readonly Interpretation[] = [...byFormAndSymbol.values()];

export function findInterpretation(
  symbol: string,
  form: Interpretation['form'],
): Interpretation | undefined {
  return byFormAndSymbol.get(`${form}:${symbol}`);
}

/** The option in effect for a symbol given the document's choices (falls back to the default). */
export function chosenOption(
  interpretation: Interpretation,
  choices: Readonly<Record<string, string>>,
): InterpretationOption | undefined {
  const id = choices[interpretation.symbol] ?? interpretation.defaultOption;
  return (
    interpretation.options.find((o) => o.id === id) ??
    interpretation.options.find((o) => o.id === interpretation.defaultOption)
  );
}

export function meaningOf(
  symbol: string,
  form: Interpretation['form'],
  choices: Readonly<Record<string, string>>,
): { interpretation: Interpretation; option: InterpretationOption; meaning: Meaning } | undefined {
  const interpretation = findInterpretation(symbol, form);
  const option = interpretation && chosenOption(interpretation, choices);
  return interpretation && option ? { interpretation, option, meaning: option.meaning } : undefined;
}
