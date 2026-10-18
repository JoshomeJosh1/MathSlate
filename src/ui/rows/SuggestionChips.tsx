import type { Command } from '../../registries/commands';

interface Props {
  suggestions: readonly { command: Command; title: string }[];
  onPick: (command: Command) => void;
}

/** The most relevant commands for the focused row, as one-click chips. */
export function SuggestionChips({ suggestions, onPick }: Props) {
  if (suggestions.length === 0) return null;
  return (
    <div className="suggestions" aria-label="Suggested commands">
      {suggestions.map(({ command: c, title }) => (
        <button
          key={c.id}
          className="chip"
          title={c.description}
          // Keep focus in the math field so the chips stay visible.
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={() => {
            onPick(c);
          }}
        >
          /{c.slash}
          {title !== c.slash && <span className="chip-title">{title}</span>}
        </button>
      ))}
    </div>
  );
}
