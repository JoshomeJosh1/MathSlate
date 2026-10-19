import { useImperativeHandle, useRef, type Ref } from 'react';
import type { EditorKeyAction, MathEditorHandle } from '../editor';

interface Props {
  value: string;
  onChange: (text: string) => void;
  onKeyAction: (action: EditorKeyAction) => void;
  onFocus?: () => void;
  /** 'folder': a folder's title (no headings, "Folder" placeholder). */
  variant?: 'note' | 'folder';
  ref?: Ref<MathEditorHandle>;
}

/**
 * Plain-text row for headings and explanations. Wraps and grows to fit its text. Lines starting
 * with "#" render as headings ("##" as subheadings). Enter starts a new math row; Shift+Enter inserts a line break.
 */
export function NoteEditor({
  value,
  onChange,
  onKeyAction,
  onFocus,
  variant = 'note',
  ref,
}: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      // Caret at the end, e.g. after the "# " of a new heading.
      focus: () => {
        const el = area.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      },
      getLatex: () => area.current?.value ?? '',
    }),
    [],
  );

  const style =
    variant === 'folder'
      ? ' folder-title'
      : value.startsWith('##')
        ? ' subheading'
        : value.startsWith('#')
          ? ' heading'
          : '';
  const label = variant === 'folder' ? 'Folder' : 'Note';
  // The box grows to fit the text (and shrinks back) without measuring it: a hidden copy of the
  // text (::after, see styles.css) shares the textarea's grid cell and sets its height. Measuring
  // scrollHeight instead forced a layout of the whole page for every note.
  return (
    <div className={`note-editor${style}`} data-value={value}>
      <textarea
        ref={area}
        value={value}
        rows={1}
        placeholder={label}
        aria-label={label}
        onFocus={onFocus}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          const el = e.currentTarget;
          const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
          const atEnd = el.selectionStart === el.value.length;
          if (e.key === 'Escape') {
            e.preventDefault();
            el.blur();
            onKeyAction('escape');
          } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onKeyAction('enter');
          } else if (e.key === 'Backspace' && el.value === '') {
            e.preventDefault();
            onKeyAction('toMath');
          } else if (e.key === 'ArrowUp' && atStart) {
            e.preventDefault();
            onKeyAction('moveUp');
          } else if (e.key === 'ArrowDown' && atEnd) {
            e.preventDefault();
            onKeyAction('moveDown');
          }
        }}
      />
    </div>
  );
}
