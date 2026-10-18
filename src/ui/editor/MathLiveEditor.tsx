import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { MathfieldElement, type InlineShortcutDefinitions } from 'mathlive';
// Importing the CSS lets Vite bundle the KaTeX fonts as hashed assets under the site's base path,
// so MathLive must not try to load them itself.
import 'mathlive/fonts.css';
import './mathlive.css';
import { CommandMenu } from './CommandMenu';
import { menuLayout, moveInGrid } from './matchCompletions';
import type { CommandCompletion, MathEditorProps } from './MathEditor';
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
  macros,
  bracketOnly,
  completions,
  ariaLabel,
  ref,
}: MathEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<MathfieldElement | null>(null);
  // The `\` menu. The element's key listener is attached once, so it reads the ref.
  const [menu, setMenuState] = useState<MenuState | null>(null);
  const menuRef = useRef<MenuState | null>(null);
  const pickRef = useRef<((item: CommandCompletion) => void) | null>(null);
  const setMenu = (next: MenuState | null) => {
    menuRef.current = next;
    setMenuState(next);
  };

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
    // MathLive's own command suggestions (for LaTeX typed after "\") list every command it
    // knows; we show our own menu instead (see openMenu).
    mf.popoverPolicy = 'off';
    // Commands such as \lcm display as one upright unit that cannot be typed into.
    mf.macros = {
      ...mf.macros,
      ...Object.fromEntries(
        Object.entries(macros ?? {}).map(([name, def]) => [
          name,
          { def, args: 0, captureSelection: true, expand: false },
        ]),
      ),
    };
    mf.value = value;
    // Our own curated list replaces MathLive's defaults (see shortcuts.ts).
    mf.inlineShortcuts = { ...INLINE_SHORTCUTS, ...shortcuts };

    // Word shortcuts (theta → θ, lcm → lcm, binom → (n k)) are provisional while you type:
    // - Backspace straight after one fires turns it back into the typed letters. MathLive's own
    //   version of this misses templates, whose empty box is selected.
    // - Typing another letter straight after one turns it back into letters too when the word
    //   goes on to spell a longer shortcut (binom → binomial) or when the shortcut only stands
    //   with brackets (lcm, gcd, binomial: "lcma" is letters, so it should not look like lcm).
    //   The longer shortcut then fires when its word is complete.
    let typed = ''; // printable characters typed since the last other key or click
    let pending: { char: string; before: string } | null = null;
    /** How the last keystroke's shortcut fired: by MathLive (undo reverts it) or by us. */
    let fired: { key: string; by: 'mathlive' | 'us' } | null = null;
    /** A word being spelled out after a shortcut was reverted (e.g. "binomi"). */
    let spelling: string | null = null;
    let applying = false;

    const wordKeys = () => Object.keys(mf.inlineShortcuts).filter((k) => /^[A-Za-z]{2,}$/.test(k));

    const onInput = () => {
      if (applying) return;
      if (pending) {
        const { char } = pending;
        const key = firedShortcut(mf.inlineShortcuts, typed, pending, mf.value);
        fired = key ? { key, by: 'mathlive' } : null;
        if (spelling !== null && !key) {
          spelling += char;
          const word = spelling;
          if (!wordKeys().some((k) => k.startsWith(word))) spelling = null;
          else if (word in mf.inlineShortcuts) {
            // The longer shortcut is complete: replace its letters ourselves (MathLive forgot
            // them when the shorter one was undone).
            const def = mf.inlineShortcuts[word];
            applying = true;
            for (let k = 0; k < word.length; k++) mf.executeCommand('deleteBackward');
            mf.insert(typeof def === 'string' ? def : (def?.value ?? word), {
              selectionMode: 'placeholder',
            });
            applying = false;
            fired = { key: word, by: 'us' };
            spelling = null;
          }
        }
        pending = null;
      }
      callbacks.current.onChange(mf.value);
    };
    // The `\` menu: our own list of commands MathSlate understands, instead of MathLive's LaTeX
    // mode, whose suggestions are every command MathLive knows. The field keeps focus; keys
    // typed while the menu is open edit its query.
    const openMenu = () => {
      const caret = mf.shadowRoot?.querySelector('.ML__caret') ?? null;
      const field = mf.getBoundingClientRect();
      const x = caret ? caret.getBoundingClientRect().left : field.left;
      setMenu({ query: '', active: 0, anchor: { x, y: field.bottom } });
    };
    const pick = (item: CommandCompletion) => {
      setMenu(null);
      mf.insert(item.latex, { selectionMode: 'placeholder', format: 'latex' });
      callbacks.current.onChange(mf.value);
    };
    pickRef.current = pick;
    /** Handles a key while the menu is open; false lets the key through to the field. */
    const menuKey = (ev: KeyboardEvent, m: MenuState): boolean => {
      const layout = menuLayout(completions ?? [], m.query);
      const items = layout.items;
      const current = items[m.active];
      const direction = ARROWS[ev.key];
      if (/^[A-Za-z]$/.test(ev.key) && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        setMenu({ ...m, query: m.query + ev.key, active: 0 });
      } else if (ev.key === 'Backspace') {
        setMenu(m.query ? { ...m, query: m.query.slice(0, -1), active: 0 } : null);
      } else if (direction) {
        setMenu({ ...m, active: moveInGrid(layout, m.active, direction) });
      } else if (ev.key === 'Enter' || ev.key === 'Tab' || ev.key === ' ') {
        if (current) pick(current);
        else setMenu(null);
      } else if (ev.key === 'Escape') {
        setMenu(null);
      } else if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(ev.key)) {
        // Modifiers on their own do nothing.
      } else {
        // Any other key (a bracket, a digit…) completes an exact name and is then typed.
        const exact = items.find((c) => c.name === m.query);
        if (exact) pick(exact);
        else setMenu(null);
        return false;
      }
      return true;
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      const open = menuRef.current;
      if (open && menuKey(ev, open)) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      if (ev.key === '\\' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault();
        ev.stopPropagation();
        typed = '';
        fired = null;
        spelling = null;
        openMenu();
        return;
      }
      const last = fired;
      fired = null;
      if (last && ev.key === 'Backspace') {
        ev.preventDefault();
        ev.stopPropagation();
        typed = '';
        spelling = null;
        revert(last);
        return;
      }
      const letter = /^[A-Za-z]$/.test(ev.key) && !ev.ctrlKey && !ev.metaKey && !ev.altKey;
      if (last && letter) {
        // The longest word ending in this letter that extends the shortcut and could still
        // spell another one: "artanh" after "tan" fired (not just "tanh").
        const run = /[A-Za-z]*$/.exec(typed + ev.key)?.[0] ?? '';
        const keys = wordKeys();
        let word: string | null = null;
        for (let s = 0; s < run.length - last.key.length && !word; s++) {
          const w = run.slice(s);
          if (keys.some((k) => k.startsWith(w))) word = w;
        }
        if (word || bracketOnly?.has(last.key)) {
          revert(last);
          spelling = word ? word.slice(0, -1) : null; // MathLive types the letter itself next
        }
      }
      if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        typed += ev.key;
        pending = { char: ev.key, before: mf.value };
      } else if (!['Shift', 'Control', 'Alt', 'Meta'].includes(ev.key)) {
        typed = '';
        pending = null;
        spelling = null;
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
      fired = null;
      spelling = null;
    };
    /** Turns a shortcut that just fired back into the letters that were typed. */
    const revert = (last: { key: string; by: 'mathlive' | 'us' }) => {
      applying = true;
      if (last.by === 'mathlive') {
        mf.executeCommand('undo');
      } else {
        mf.executeCommand('deleteBackward');
        mf.insert(last.key);
      }
      applying = false;
      callbacks.current.onChange(mf.value);
    };
    const onFocusIn = () => callbacks.current.onFocus?.();
    const onFocusOut = () => {
      setMenu(null);
      callbacks.current.onBlur?.();
    };

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

  return (
    <>
      <div ref={containerRef} className="math-editor" />
      {menu && (
        <CommandMenu
          query={menu.query}
          layout={menuLayout(completions ?? [], menu.query)}
          active={menu.active}
          anchor={menu.anchor}
          macros={macros}
          onPick={(item) => pickRef.current?.(item)}
        />
      )}
    </>
  );
}

const ARROWS: Partial<Record<string, 'left' | 'right' | 'up' | 'down'>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

interface MenuState {
  query: string;
  active: number;
  anchor: { x: number; y: number };
}

/**
 * The word shortcut (if any) completed by the keystroke that turned `before` into `after`: the
 * typed characters end with its key (letters only), and the field changed by more than inserting
 * the character, or its output newly appeared ("sinh" after "sin" fired: \sin → \sinh).
 */
function firedShortcut(
  shortcuts: InlineShortcutDefinitions,
  typed: string,
  { char, before }: { char: string; before: string },
  after: string,
): string | null {
  const rewritten = !isInsertion(before, after, char);
  const candidates = Object.entries(shortcuts)
    // Only word shortcuts: Backspace after ≤ or ″ should just delete it.
    .filter(([key]) => /^[A-Za-z]{2,}$/.test(key) && typed.endsWith(key))
    .sort(([a], [b]) => b.length - a.length);
  const found = candidates.find(([, def]) => {
    if (rewritten) return true;
    const output = (typeof def === 'string' ? def : def.value).replace(/#\?/g, '\\placeholder{}');
    return count(after, output) > count(before, output);
  });
  return found ? found[0] : null;
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
