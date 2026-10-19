import type { Interpretation } from '../../registries/interpretations';

/**
 * Built-in sequences on subscripted letters (registries/interpretations, form 'subscripted'):
 * whether C_5 is the 5th Catalan number or a name of its own is the document's choice
 * (`Doc.interpretations`). New letters start as names and ask (the prompt, under the first row
 * that uses one); a row using a letter as a sequence shows a badge that changes it.
 */

/** "C_n for …" → "Cₙ for …": the question's subscript n, readable as text. */
const readable = (text: string) => text.replace(/_n\b/g, 'ₙ');

const optionLabel = (o: Interpretation['options'][number]) =>
  o.meaning.kind === 'variable'
    ? 'Keep as a variable'
    : o.label.charAt(0).toUpperCase() + o.label.slice(1);

export function SequencePrompt({
  interpretation,
  chosen,
  onChoose,
}: {
  interpretation: Interpretation;
  /** The option in effect, if the document has chosen one. */
  chosen: string | undefined;
  onChoose: (optionId: string) => void;
}) {
  return (
    <div className="sequence-prompt" role="group" aria-label="Meaning of a subscripted letter">
      <span>{readable(interpretation.question)}</span>
      {interpretation.options.map((o) => (
        <button
          key={o.id}
          className={o.id === chosen ? 'chosen' : undefined}
          aria-pressed={o.id === chosen}
          onMouseDown={(e) => {
            e.preventDefault(); // keep the row's focus
          }}
          onClick={() => {
            onChoose(o.id);
          }}
        >
          {optionLabel(o)}
        </button>
      ))}
    </div>
  );
}

/**
 * "pₙ prime": a letter this row reads as a sequence, or "Cₙ variable" once the document chose
 * to keep it a name (so it can be switched back); clicking shows the choice again.
 */
export function SequenceBadge({
  interpretation,
  optionId,
  chosen,
  onClick,
}: {
  interpretation: Interpretation;
  optionId: string;
  /** The document chose this meaning (rather than it being the default). */
  chosen: boolean;
  onClick: () => void;
}) {
  const option = interpretation.options.find((o) => o.id === optionId);
  if (!option) return null;
  const sequence = option.meaning.kind === 'sequence';
  if (!sequence && !chosen) return null;
  const letter = `${interpretation.symbol}ₙ`;
  return (
    <button
      className={`sequence-badge${sequence ? '' : ' plain'}`}
      title={
        sequence
          ? `${letter} means the ${option.label} sequence here. Click to change.`
          : `${letter} is an ordinary name here. Click to use it as a built-in sequence.`
      }
      onClick={onClick}
    >
      {letter} {sequence ? option.label.replace(/^n-th /, '') : 'variable'}
    </button>
  );
}
