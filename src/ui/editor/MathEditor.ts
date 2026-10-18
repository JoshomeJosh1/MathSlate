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
  | 'moveDown';

export interface MathEditorHandle {
  focus: () => void;
  getLatex: () => string;
}

export interface MathEditorProps {
  /** LaTeX content. The editor is controlled: external changes are pushed into the field. */
  value: string;
  onChange: (latex: string) => void;
  onKeyAction?: (action: EditorKeyAction) => void;
  onFocus?: () => void;
  ariaLabel?: string;
  ref?: Ref<MathEditorHandle>;
}
