import { useEffect, useImperativeHandle, useRef } from 'react';
import { MathfieldElement, type InlineShortcutDefinitions } from 'mathlive';
// Importing the CSS lets Vite bundle the KaTeX fonts as hashed assets under the site's base path,
// so MathLive must not try to load them itself.
import 'mathlive/fonts.css';
import './mathlive.css';
import type { MathEditorProps } from './MathEditor';
import { INLINE_SHORTCUTS } from './shortcuts';

MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

/**
 * MathLive implementation of the MathEditor contract. The <math-field> element is created
 * imperatively (MathLive ships no JSX typings) and mounted into a container div.
 */
export function MathLiveEditor({
  value,
  onChange,
  onKeyAction,
  onFocus,
  onBlur,
  shortcuts,
  ariaLabel,
  ref,
}: MathEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<MathfieldElement | null>(null);

  // Callbacks change identity on every render; keep the latest in a ref so the element's
  // listeners are attached once.
  const callbacks = useRef({ onChange, onKeyAction, onFocus, onBlur });
  useEffect(() => {
    callbacks.current = { onChange, onKeyAction, onFocus, onBlur };
  });

  useImperativeHandle(
    ref,
    () => ({
      focus: () => fieldRef.current?.focus(),
      getLatex: () => fieldRef.current?.value ?? '',
    }),
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Some MathLive properties (e.g. menuItems) throw until the element is in the DOM,
    // so mount first and configure afterwards.
    const mf = new MathfieldElement();
    if (ariaLabel) mf.setAttribute('aria-label', ariaLabel);
    container.appendChild(mf);
    mf.mathVirtualKeyboardPolicy = 'manual';
    mf.menuItems = [];
    mf.smartFence = true;
    mf.value = value;
    // Our own curated list replaces MathLive's defaults (see shortcuts.ts).
    mf.inlineShortcuts = { ...INLINE_SHORTCUTS, ...shortcuts };

    // Backspace straight after an inline shortcut fired undoes the shortcut and leaves the typed
    // letters (binom → \binom{}{}, Backspace → "binom", so binomial(…) can still be typed).
    // MathLive's own version of this misses templates, whose empty box is selected.
    let typed = ''; // printable characters typed since the last other key or click
    let pending: { char: string; before: string } | null = null;
    let shortcutFired = false;

    const onInput = () => {
      if (pending) {
        shortcutFired = firedShortcut(mf.inlineShortcuts, typed, pending, mf.value);
        pending = null;
      }
      callbacks.current.onChange(mf.value);
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      const justFired = shortcutFired;
      shortcutFired = false;
      if (ev.key === 'Backspace' && justFired) {
        ev.preventDefault();
        ev.stopPropagation();
        typed = '';
        mf.executeCommand('undo');
        return;
      }
      if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        typed += ev.key;
        pending = { char: ev.key, before: mf.value };
      } else if (!['Shift', 'Control', 'Alt', 'Meta'].includes(ev.key)) {
        typed = '';
        pending = null;
      }
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        ev.stopPropagation();
        callbacks.current.onKeyAction?.('enter');
      } else if (ev.key === '"' && mf.value === '') {
        ev.preventDefault();
        ev.stopPropagation();
        callbacks.current.onKeyAction?.('toNote');
      } else if (ev.key === 'Backspace' && mf.value === '') {
        ev.preventDefault();
        callbacks.current.onKeyAction?.('backspaceEmpty');
      }
    };
    const onMoveOut = (ev: CustomEvent<{ direction: string }>) => {
      if (ev.detail.direction === 'upward') callbacks.current.onKeyAction?.('moveUp');
      else if (ev.detail.direction === 'downward') callbacks.current.onKeyAction?.('moveDown');
    };
    const onPointerDown = () => {
      typed = '';
      shortcutFired = false;
    };
    const onFocusIn = () => callbacks.current.onFocus?.();
    const onFocusOut = () => callbacks.current.onBlur?.();

    mf.addEventListener('input', onInput);
    mf.addEventListener('keydown', onKeyDown, { capture: true });
    mf.addEventListener('move-out', onMoveOut);
    mf.addEventListener('pointerdown', onPointerDown);
    mf.addEventListener('focusin', onFocusIn);
    mf.addEventListener('focusout', onFocusOut);
    fieldRef.current = mf;

    return () => {
      mf.removeEventListener('input', onInput);
      mf.removeEventListener('keydown', onKeyDown, { capture: true });
      mf.removeEventListener('move-out', onMoveOut);
      mf.removeEventListener('pointerdown', onPointerDown);
      mf.removeEventListener('focusin', onFocusIn);
      mf.removeEventListener('focusout', onFocusOut);
      mf.remove();
      fieldRef.current = null;
    };
    // The element is created once; `value` changes are synced by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mf = fieldRef.current;
    if (mf && mf.value !== value) mf.value = value;
  }, [value]);

  useEffect(() => {
    const mf = fieldRef.current;
    if (mf) mf.inlineShortcuts = { ...INLINE_SHORTCUTS, ...shortcuts };
  }, [shortcuts]);

  return <div ref={containerRef} className="math-editor" />;
}

/**
 * Whether the keystroke that turned `before` into `after` completed a word shortcut: the typed
 * characters end with a shortcut's key (letters only), and the field changed by more than inserting the
 * character, or the shortcut's output newly appeared ("sinh" after "sin" fired: \sin → \sinh).
 */
function firedShortcut(
  shortcuts: InlineShortcutDefinitions,
  typed: string,
  { char, before }: { char: string; before: string },
  after: string,
): boolean {
  const rewritten = !isInsertion(before, after, char);
  return Object.entries(shortcuts).some(([key, def]) => {
    // Only word shortcuts: Backspace after ≤ or ″ should just delete it.
    if (!/^[A-Za-z]{2,}$/.test(key) || !typed.endsWith(key)) return false;
    if (rewritten) return true;
    const output = (typeof def === 'string' ? def : def.value).replace(/#\?/g, '\\placeholder{}');
    return count(after, output) > count(before, output);
  });
}

function count(text: string, part: string): number {
  return part ? text.split(part).length - 1 : 0;
}

/** Whether `after` is `before` with `char` inserted somewhere (i.e. no shortcut rewrote it). */
function isInsertion(before: string, after: string, char: string): boolean {
  if (after.length !== before.length + char.length) return false;
  let i = 0;
  while (i < before.length && before[i] === after[i]) i++;
  return (
    after.slice(i, i + char.length) === char && after.slice(i + char.length) === before.slice(i)
  );
}
