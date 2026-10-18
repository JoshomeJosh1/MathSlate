import { useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
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

  // Grow to fit the content (and shrink back), including after the width changes.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [value]);

  const style =
    variant === 'folder'
      ? ' folder-title'
      : value.startsWith('##')
        ? ' subheading'
        : value.startsWith('#')
          ? ' heading'
          : '';
  const label = variant === 'folder' ? 'Folder' : 'Note';
  return (
    <textarea
      ref={area}
      className={`note-editor${style}`}
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
        if (e.key === 'Enter' && !e.shiftKey) {
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
  );
}
