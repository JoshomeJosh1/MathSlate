import type { Command } from '../../registries/commands';

interface Props {
  suggestions: readonly { command: Command; title: string }[];
  onPick: (command: Command) => void;
  /** Opens the command palette (every command, with arguments). */
  onMore: () => void;
}

/** The most relevant commands for the focused row, as one-click chips, then "/ more…". */
export function SuggestionChips({ suggestions, onPick, onMore }: Props) {
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
      <button
        className="chip chip-more"
        title="All commands, with arguments (Ctrl+/)"
        onMouseDown={(e) => {
          e.preventDefault();
        }}
        onClick={onMore}
      >
        / more…
      </button>
    </div>
  );
}
