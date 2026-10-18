import { useImperativeHandle, useRef, type Ref } from 'react';
import type { EditorKeyAction, MathEditorHandle } from '../editor';

interface Props {
  value: string;
  onChange: (text: string) => void;
  onKeyAction: (action: EditorKeyAction) => void;
  onFocus?: () => void;
  ref?: Ref<MathEditorHandle>;
}

/** Plain-text row for headings and explanations. Lines starting with "#" render as headings. */
export function NoteEditor({ value, onChange, onKeyAction, onFocus, ref }: Props) {
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      focus: () => input.current?.focus(),
      getLatex: () => input.current?.value ?? '',
    }),
    [],
  );
  const heading = value.startsWith('#');
  return (
    <input
      ref={input}
      className={`note-editor${heading ? ' heading' : ''}`}
      value={value}
      placeholder="Note"
      aria-label="Note"
      onFocus={onFocus}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      onKeyDown={(e) => {
        const el = e.currentTarget;
        if (e.key === 'Enter') {
          e.preventDefault();
          onKeyAction('enter');
        } else if (e.key === 'Backspace' && el.value === '') {
          e.preventDefault();
          onKeyAction('toMath');
        } else if (e.key === 'ArrowUp') {
          onKeyAction('moveUp');
        } else if (e.key === 'ArrowDown') {
          onKeyAction('moveDown');
        }
      }}
    />
  );
}
