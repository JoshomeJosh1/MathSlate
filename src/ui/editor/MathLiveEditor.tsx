import { useEffect, useImperativeHandle, useRef } from 'react';
import { MathfieldElement, type InlineShortcutDefinitions } from 'mathlive';
// Importing the CSS lets Vite bundle the KaTeX fonts as hashed assets under the site's base path,
// so MathLive must not try to load them itself.
import 'mathlive/fonts.css';
import './mathlive.css';
import type { MathEditorProps } from './MathEditor';

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
  const defaultShortcuts = useRef<InlineShortcutDefinitions>({});

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
    const shortcuts: InlineShortcutDefinitions = {
      ...mf.inlineShortcuts,
      // MathLive turns '' into the single glyph \doubleprime (″) but ''' into three ordinary
      // primes; use ordinary primes for '' too so every derivative order looks the same.
      "''": '^{\\prime\\prime}',
      // A bare integral sign: bounds are optional (type _ and ^ after it for a definite one).
      int: '\\int',
      '∂': '\\partial',
    };
    // "dx" stays two letters: the parser recognises differentials in calculus notation and
    // only those are shown upright (core/decorate.ts), so d·x elsewhere is not mangled.
    delete shortcuts.dx;
    delete shortcuts.dy;
    delete shortcuts.dt;
    defaultShortcuts.current = shortcuts;
    mf.inlineShortcuts = defaultShortcuts.current;

    const onInput = () => {
      callbacks.current.onChange(mf.value);
    };
    const onKeyDown = (ev: KeyboardEvent) => {
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
    const onFocusIn = () => callbacks.current.onFocus?.();
    const onFocusOut = () => callbacks.current.onBlur?.();

    mf.addEventListener('input', onInput);
    mf.addEventListener('keydown', onKeyDown, { capture: true });
    mf.addEventListener('move-out', onMoveOut);
    mf.addEventListener('focusin', onFocusIn);
    mf.addEventListener('focusout', onFocusOut);
    fieldRef.current = mf;

    return () => {
      mf.removeEventListener('input', onInput);
      mf.removeEventListener('keydown', onKeyDown, { capture: true });
      mf.removeEventListener('move-out', onMoveOut);
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
    if (mf) mf.inlineShortcuts = { ...defaultShortcuts.current, ...shortcuts };
  }, [shortcuts]);

  return <div ref={containerRef} className="math-editor" />;
}
