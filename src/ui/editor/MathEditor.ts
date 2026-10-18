import type { Ref } from 'react';

/**
 * Editor-agnostic contract for a single math input. The rest of the app depends only on
 * this file; `index.ts` decides which implementation backs it (currently MathLive).
 */

/** Keyboard intents the editor reports instead of handling itself. */
export type EditorKeyAction =
  | 'enter' // commit row / create a new row below
  | 'backspaceEmpty' // Backspace pressed while the field is empty
  | 'moveUp' // caret tried to leave the field upwards
  | 'moveDown'
  | 'toNote' // `"` typed into an empty field: turn the row into a note
  | 'toHeading' // `#` typed into an empty field: turn the row into a heading note
  | 'toFolder' // `@` typed into an empty field: turn the row into a folder
  | 'toMath' // Backspace in an empty note: turn it back into a math row
  | 'escape'; // Esc: the field has let go of focus

export interface MathEditorHandle {
  focus: () => void;
  getLatex: () => string;
}

export interface CommandCompletion {
  /** Typed after `\`. */
  name: string;
  /** Inserted; `#?` marks an empty box to fill in. */
  latex: string;
  /** Shown on hover. */
  description: string;
  /** Heading in the menu; groups appear in the order of their first entry. */
  group: string;
  /** What the tile shows, if not `latex`. */
  display?: string;
  /** A wide tile (a function name) rather than a symbol-sized one. */
  wide?: boolean;
}

export interface MathEditorProps {
  /** LaTeX content. The editor is controlled: external changes are pushed into the field. */
  value: string;
  onChange: (latex: string) => void;
  onKeyAction?: (action: EditorKeyAction) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /**
   * Extra text → LaTeX replacements applied as the user types (like "sin" → \sin), e.g.
   * defined multi-letter names → upright \mathrm{…}. Keep the object identity stable.
   */
  shortcuts?: Readonly<Record<string, string>>;
  /**
   * Commands without arguments the editor should know, by name, with the LaTeX that displays
   * them: `{ lcm: '\\operatorname{lcm}' }` makes `\lcm` one upright unit. Read once.
   */
  macros?: Readonly<Record<string, string>>;
  /**
   * Shortcut keys that only stand when brackets follow (lcm needs lcm(…)): typing another letter
   * straight after one turns it back into plain letters. Read once.
   */
  bracketOnly?: ReadonlySet<string>;
  /**
   * What the `\` menu offers (instead of every LaTeX command the editor knows). Read once.
   * `latex` is inserted; `#?` marks an empty box to fill in.
   */
  completions?: readonly CommandCompletion[];
  ariaLabel?: string;
  ref?: Ref<MathEditorHandle>;
}
