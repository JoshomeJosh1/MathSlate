import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { MathfieldElement, type InlineShortcutDefinitions } from 'mathlive';
// Importing the CSS lets Vite bundle the KaTeX fonts as hashed assets under the site's base path,
// so MathLive must not try to load them itself.
import 'mathlive/fonts.css';
import './mathlive.css';
import { CommandMenu, type MenuAnchor } from './CommandMenu';
import { menuLayout, moveInGrid } from './matchCompletions';
import type { CommandCompletion, EditorKeyAction, MathEditorProps } from './MathEditor';
import { emptyStructureRange, removeStrayPlaceholders } from './emptyStructure';
import { errorRange } from './errorRange';
import { KEYBOARD_LAYOUTS } from './keyboardLayouts';
import { INLINE_SHORTCUTS } from './shortcuts';
import { UNIT_MACRO, UNIT_SHADOW_CSS, unitsAsBrackets } from './unitLatex';

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
  error,
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
    // Phones and tablets get MathLive's math keyboard when a row is focused: MathLive never
    // brings up the system keyboard (its input element is inputmode=none). Desktops are left
    // alone ('auto' only applies to touch screens).
    mf.mathVirtualKeyboardPolicy = 'auto';
    keepRowsAboveKeyboard();
    mf.menuItems = [];
    mf.smartFence = true;
    // Typed characters never take the style of the one before the caret: by default MathLive
    // continues an upright \mathrm{speed}, so "speed*3" became \mathrm{speed\cdot3}. Upright text
    // only comes from shortcuts and decoration (core/decorate.ts).
    mf.onInsertStyle = () => ({});
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
      // Units: one unit you cannot type inside; Backspace deletes it whole.
      unit: { def: UNIT_MACRO, args: 1, captureSelection: true, expand: false },
    };
    if (mf.shadowRoot) {
      const style = document.createElement('style');
      style.textContent = UNIT_SHADOW_CSS;
      mf.shadowRoot.append(style);
    }
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
    let pending: { char: string; before: string; virtual: boolean } | null = null;
    /** The shortcut the last keystroke fired. */
    let fired: Fired | null = null;
    /** A word being spelled out after a shortcut was reverted (e.g. "binomi"). */
    let spelling: string | null = null;
    let applying = false;

    const wordKeys = () => Object.keys(mf.inlineShortcuts).filter((k) => /^[A-Za-z]{2,}$/.test(k));

    /** Set by Backspace/Delete: the next change is a deletion (see removeStray). */
    let deleting = false;
    /**
     * After a deletion, removes empty boxes that belong to nothing any more (deleting a
     * function's name leaves its argument box in bare brackets), keeping the caret in place.
     */
    const removeStray = () => {
      const { latex, removed } = removeStrayPlaceholders(mf.value);
      if (removed.length === 0) return;
      const position = mf.position;
      const prefix = mf.getValue(0, position, 'latex');
      // Boxes removed before the caret move it back by one each.
      const shift = mf.value.startsWith(prefix)
        ? removed.filter((at) => at < prefix.length).length
        : 0;
      applying = true;
      mf.value = latex;
      mf.position = Math.max(0, Math.min(position - shift, mf.lastOffset));
      applying = false;
    };

    const onInput = () => {
      if (applying) return;
      if (deleting) {
        deleting = false;
        removeStray();
      }
      if (pending) {
        const { char, virtual } = pending;
        const key = firedShortcut(mf.inlineShortcuts, typed, pending, mf.value);
        fired = key ? { key, by: 'mathlive' } : virtual ? applyShortcut() : null;
        if (spelling !== null && !key) {
          spelling += char;
          const word = spelling;
          if (!wordKeys().some((k) => k.startsWith(word))) spelling = null;
          else if (fired)
            spelling = null; // applyShortcut did it
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
      setMenu({ query: '', active: 0, anchor: { x, top: field.top, bottom: field.bottom } });
    };
    const pick = (item: CommandCompletion) => {
      setMenu(null);
      mf.insert(item.latex, { selectionMode: 'placeholder', format: 'latex' });
      callbacks.current.onChange(mf.value);
    };
    pickRef.current = pick;
    /** Handles a key while the menu is open; false lets the key through to the field. */
    const menuKey = (ev: KeyLike, m: MenuState): boolean => {
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

    /**
     * Growing a matrix as you type, as in [1, 2; 3, 4], with the caret in one of its cells: ";"
     * goes to the next row (adding one at the bottom), "," to the next entry (adding a column at
     * the end), and Backspace in an empty cell removes its row or column if it is all empty.
     * Returns whether it handled the key.
     */
    const matrixKey = (ev: KeyLike): boolean => {
      if (ev.altKey || ev.metaKey || ev.ctrlKey) return false;
      if (ev.key !== ';' && ev.key !== ',' && ev.key !== 'Backspace') return false;
      const cell = matrixCell(mf);
      if (!cell) return false;
      const { array, row, col } = cell;
      const grow = (command: 'addRowAfter' | 'addColumnAfter', r: number, c: number) => {
        applying = true;
        mf.executeCommand(command);
        // The new row or column's entries get empty boxes, like the rest of the template.
        fillEmptyCells(mf, array);
        moveToCell(mf, array, r, c);
        applying = false;
        return true;
      };
      if (ev.key === ';') {
        return row + 1 < array.rowCount
          ? moveToCell(mf, array, row + 1, 0)
          : grow('addRowAfter', row + 1, 0);
      }
      if (ev.key === ',') {
        return col + 1 < array.colCount
          ? moveToCell(mf, array, row, col + 1)
          : grow('addColumnAfter', row, col + 1);
      }
      // Backspace in an empty entry (its box may be selected).
      if (!isEmptyCell(array.getCell(row, col))) return false;
      const rowEmpty = Array.from({ length: array.colCount }, (_, c) => array.getCell(row, c));
      const colEmpty = Array.from({ length: array.rowCount }, (_, r) => array.getCell(r, col));
      if (array.rowCount > 1 && rowEmpty.every(isEmptyCell)) return mf.executeCommand('removeRow');
      if (array.colCount > 1 && colEmpty.every(isEmptyCell)) {
        return mf.executeCommand('removeColumn');
      }
      return false;
    };

    /** Set while a physical key is handled, so onBeforeInput only acts for the math keyboard. */
    let fromKey = false;
    /**
     * The math keyboard's keys reach MathLive as commands, not key events: its return key is
     * "commit" (a line break) and its delete key "deleteBackward". Give them the meaning Enter
     * and Backspace have on a physical keyboard.
     */
    const onBeforeInput = (ev: Event) => {
      if (fromKey || applying || !(ev instanceof InputEvent)) return;
      // A physical key's character (its keydown, already handled, set `pending`).
      if (ev.inputType === 'insertText' && pending && !pending.virtual) return;
      const data = ev.inputType === 'insertText' && ev.data?.length === 1 ? ev.data : null;
      // The math keyboard's keys, for what physical keys do in onKeyDown: the `\` menu (its
      // letters filter, delete and return), opening it, and growing a matrix with , and ;.
      const open = menuRef.current;
      if (open) {
        const key =
          data ??
          (ev.inputType === 'deleteContentBackward'
            ? 'Backspace'
            : ev.inputType === 'insertLineBreak'
              ? 'Enter'
              : null);
        if (key !== null) {
          ev.preventDefault();
          // Any other character completes an exact name and is then typed (here: MathLive loses
          // its own insert once the field has changed).
          if (!menuKey(virtualKey(key), open) && data !== null) {
            mf.insert(data);
            callbacks.current.onChange(mf.value);
          }
          return;
        }
      }
      if (data === '\\') {
        ev.preventDefault();
        typed = '';
        fired = null;
        spelling = null;
        openMenu();
        return;
      }
      const matrix =
        data === ',' || data === ';'
          ? data
          : ev.inputType === 'deleteContentBackward' && !fired
            ? 'Backspace'
            : null;
      if (matrix !== null && matrixKey(virtualKey(matrix))) {
        ev.preventDefault();
        typed = '';
        fired = null;
        spelling = null;
        callbacks.current.onChange(mf.value);
        return;
      }
      const last = fired;
      fired = null;
      if (ev.inputType === 'insertLineBreak') {
        ev.preventDefault();
        callbacks.current.onKeyAction?.('enter');
      } else if (ev.inputType === 'deleteContentBackward' && last) {
        // Delete straight after a shortcut fired turns it back into letters, as Backspace does.
        ev.preventDefault();
        typed = '';
        spelling = null;
        revert(last);
      } else if (ev.inputType === 'deleteContentBackward' && deleteSubscriptDigit()) {
        ev.preventDefault();
        callbacks.current.onChange(mf.value);
      } else if (ev.inputType === 'deleteContentBackward' && mf.value === '') {
        ev.preventDefault();
        callbacks.current.onKeyAction?.('backspaceEmpty');
      } else if (ev.inputType === 'insertText' && ev.data?.length === 1) {
        if (subscriptDigit(ev.data)) {
          ev.preventDefault();
          callbacks.current.onChange(mf.value);
        } else if (beforeChar(ev.data, last, true)) {
          // MathLive loses its own insert when the field changed under it: type the key here.
          ev.preventDefault();
          applying = true;
          mf.insert(ev.data);
          applying = false;
          onInput();
        }
      } else {
        typed = '';
        pending = null;
        spelling = null;
      }
    };

    /**
     * A digit straight after a letter is its subscript, and more digits extend it (x1 → x₁,
     * x12 → x₁₂, out3 → out₃); the caret stays after the subscript, so whatever comes next is
     * typed normally (x1+2). Types the digit itself and returns true when it applies.
     */
    const subscriptDigit = (char: string): boolean => {
      if (!/^\d$/.test(char)) return false;
      const target = subscriptTarget(mf);
      if (!target) return false;
      const restore = { value: mf.value, position: mf.position, insert: char };
      applying = true;
      if (target === 'new') mf.executeCommand('moveToSubscript');
      else mf.position = target.end;
      mf.insert(char);
      mf.executeCommand('moveAfterParent');
      applying = false;
      // Backspace straight after the first digit makes it a plain digit again.
      fired = target === 'new' ? { key: char, by: 'us', restore } : null;
      typed = '';
      pending = null;
      spelling = null;
      return true;
    };

    /**
     * Backspace just after a number subscript (x₁₂|) deletes its last digit, and the subscript
     * with it when that was the only one; MathLive would only step into it. Returns whether it
     * did.
     */
    const deleteSubscriptDigit = (): boolean => {
      const target = subscriptTarget(mf);
      if (!target || target === 'new') return false;
      applying = true;
      if (target.digits > 1) {
        mf.position = target.end;
        mf.executeCommand('deleteBackward');
        mf.executeCommand('moveAfterParent');
      } else {
        mf.selection = { ranges: [[target.letter, mf.position]], direction: 'none' };
        mf.executeCommand('deleteBackward');
      }
      applying = false;
      typed = '';
      pending = null;
      spelling = null;
      return true;
    };

    /**
     * A printable character is about to be typed, from a physical key or the math keyboard
     * (`virtual`, whose keys MathLive inserts without applying inline shortcuts: onInput then
     * applies them, see applyShortcut). `last` is the shortcut the previous character fired.
     * Returns whether it turned that shortcut back into letters.
     */
    const beforeChar = (char: string, last: Fired | null, virtual: boolean): boolean => {
      let reverted = false;
      if (last && /^[A-Za-z]$/.test(char)) {
        // The longest word ending in this letter that extends the shortcut and could still
        // spell another one: "artanh" after "tan" fired (not just "tanh").
        const run = /[A-Za-z]*$/.exec(typed + char)?.[0] ?? '';
        const keys = wordKeys();
        let word: string | null = null;
        for (let s = 0; s < run.length - last.key.length && !word; s++) {
          const w = run.slice(s);
          if (keys.some((k) => k.startsWith(w))) word = w;
        }
        if (word || bracketOnly?.has(last.key)) {
          revert(last);
          reverted = true;
          spelling = word ? word.slice(0, -1) : null; // the letter itself is typed next
        }
      } else if (last && bracketOnly?.has(last.key) && BREAKS_CALL.test(char)) {
        // Anything but its brackets (or a subscript/power: Li_s, erf^{-1}) after a name that
        // needs them: "2Ai+1" is 2·A·i + 1, so the name goes back to letters before the key.
        revert(last);
        reverted = true;
      }
      typed += char;
      pending = { char, before: mf.value, virtual };
      return reverted;
    };

    /**
     * The word shortcut the letters just before the caret spell, applied as MathLive does for
     * physical keys (the longest one; `after` rules: "mu" not straight after a letter). Returns
     * the shortcut, or null when none applies.
     */
    const applyShortcut = (): Fired | null => {
      const at = mf.position;
      const letters = (from: number) => mf.getValue(Math.max(0, from), at, 'latex');
      // Word shortcuts, and symbol ones made of characters MathLive keeps as typed (-> <= != +-).
      const symbolKeys = Object.keys(mf.inlineShortcuts).filter((k) => /^[-+<>=!]{2,}$/.test(k));
      const key = [...wordKeys(), ...symbolKeys]
        .filter((k) => typed.endsWith(k) && k.length <= at && letters(at - k.length) === k)
        .sort((a, b) => b.length - a.length)
        .find((k) => {
          const def = mf.inlineShortcuts[k];
          const start = at - k.length;
          const guarded = typeof def === 'object' && def.after !== undefined;
          return !guarded || start === 0 || !/^[A-Za-z]$/.test(letters(start - 1).slice(0, 1));
        });
      const def = key === undefined ? undefined : mf.inlineShortcuts[key];
      if (key === undefined || def === undefined) return null;
      const start = at - key.length;
      const end = mf.lastOffset - key.length;
      applying = true;
      mf.selection = { ranges: [[start, at]], direction: 'none' };
      mf.insert(typeof def === 'string' ? def : def.value, {
        selectionMode: 'placeholder',
        format: 'latex',
      });
      applying = false;
      return { key, by: 'us', span: { start, length: mf.lastOffset - end } };
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      fromKey = true;
      queueMicrotask(() => (fromKey = false));
      const open = menuRef.current;
      if (open && menuKey(ev, open)) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      if (ev.key === 'Escape') {
        // Leave the row (the `\` menu, when open, took Esc above).
        ev.preventDefault();
        ev.stopPropagation();
        mf.blur();
        callbacks.current.onKeyAction?.('escape');
        return;
      }
      if (ev.key === '/' && (ev.ctrlKey || ev.metaKey) && !ev.altKey) {
        ev.preventDefault();
        ev.stopPropagation();
        callbacks.current.onKeyAction?.('palette');
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
      // Matrix keys, except Backspace straight after a shortcut fired (mat → letters again).
      if (!(fired && ev.key === 'Backspace') && matrixKey(ev)) {
        ev.preventDefault();
        ev.stopPropagation();
        typed = '';
        fired = null;
        spelling = null;
        callbacks.current.onChange(mf.value);
        return;
      }
      if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && subscriptDigit(ev.key)) {
        ev.preventDefault();
        ev.stopPropagation();
        callbacks.current.onChange(mf.value);
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
      if (ev.key === 'Backspace' && !ev.ctrlKey && !ev.altKey && deleteSubscriptDigit()) {
        ev.preventDefault();
        ev.stopPropagation();
        callbacks.current.onChange(mf.value);
        return;
      }
      deleting = ev.key === 'Backspace' || ev.key === 'Delete';
      if ((ev.key === 'Backspace' || ev.key === 'Delete') && deleteEmptyStructure(ev.key)) {
        deleting = false;
        ev.preventDefault();
        ev.stopPropagation();
        typed = '';
        spelling = null;
        callbacks.current.onChange(mf.value);
        return;
      }
      if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        beforeChar(ev.key, last, false);
      } else if (!['Shift', 'Control', 'Alt', 'Meta'].includes(ev.key)) {
        typed = '';
        pending = null;
        spelling = null;
      }
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        ev.stopPropagation();
        callbacks.current.onKeyAction?.('enter');
      } else if (ev.key in EMPTY_ROW_KEYS && mf.value === '') {
        ev.preventDefault();
        ev.stopPropagation();
        const action = EMPTY_ROW_KEYS[ev.key];
        if (action) callbacks.current.onKeyAction?.(action);
      } else if (ev.key === 'Backspace' && mf.value === '') {
        ev.preventDefault();
        callbacks.current.onKeyAction?.('backspaceEmpty');
      }
    };
    const onMoveOut = (ev: CustomEvent<{ direction: string }>) => {
      if (ev.detail.direction === 'upward') callbacks.current.onKeyAction?.('moveUp');
      else if (ev.detail.direction === 'downward') callbacks.current.onKeyAction?.('moveDown');
    };
    /**
     * Where the last click landed in a drawn unit, as a fraction of the way across its text (0 at
     * its start, 1 at its end), or null if it was not on a unit (see unitsToBrackets).
     */
    let clickedUnit: number | null = null;
    const onPointerDown = (ev: PointerEvent) => {
      typed = '';
      fired = null;
      spelling = null;
      clickedUnit = pointOnUnit(mf, ev.clientX, ev.clientY);
    };
    /**
     * Backspace after / Delete before a structure whose boxes are all empty (√□, □/□, Σ) removes
     * it whole. MathLive would step into it, or unwrap it and leave a stray empty box behind.
     * Returns whether it did.
     */
    const deleteEmptyStructure = (key: 'Backspace' | 'Delete'): boolean => {
      if (!mf.selectionIsCollapsed) return false;
      const range = emptyStructureRange(
        (a, b) => mf.getValue(a, b, 'latex'),
        mf.position,
        mf.lastOffset,
        key === 'Delete' ? 'forward' : 'backward',
      );
      if (!range) return false;
      applying = true;
      mf.selection = { ranges: [range], direction: 'none' };
      mf.executeCommand('deleteBackward');
      applying = false;
      return true;
    };
    /** Turns a shortcut that just fired back into the letters that were typed. */
    const revert = (last: Fired) => {
      applying = true;
      if (last.restore) {
        // An automatic subscript: the field as it was, then the digit typed plainly.
        mf.value = last.restore.value;
        mf.position = last.restore.position;
        mf.insert(last.restore.insert);
      } else if (last.span) {
        // Replace just what it inserted: replacing the whole value here would lose the key the
        // math keyboard is about to type.
        const { start, length } = last.span;
        mf.selection = { ranges: [[start, start + length]], direction: 'none' };
        mf.insert(last.key);
        mf.position = start + last.key.length;
      } else if (last.by === 'mathlive') {
        mf.executeCommand('undo');
      } else {
        mf.executeCommand('deleteBackward');
        mf.insert(last.key);
      }
      applying = false;
      callbacks.current.onChange(mf.value);
    };
    /**
     * Units are one block each (\unit{km}), which cannot be typed into: while the row is being
     * edited they are shown as typed, [km], and become blocks again when it is left (decoration).
     * The caret stays where it was: the LaTeX before it, converted the same way, is measured.
     */
    const unitsToBrackets = () => {
      if (!mf.hasFocus() || !mf.value.includes('\\unit{')) return;
      const prefix = mf.getValue(0, mf.position, 'latex');
      const suffix = mf.getValue(mf.position, mf.lastOffset, 'latex');
      const full = mf.value;
      const fraction = clickedUnit;
      clickedUnit = null;
      // Positions after the converted LaTeX (the caret's offset once units are brackets).
      const offsetAfter = (latex: string) => {
        mf.value = unitsAsBrackets(latex);
        return mf.lastOffset;
      };
      applying = true;
      let caret = offsetAfter(prefix);
      // Clicked on a unit, the caret is beside it: [start, end] are its brackets' positions.
      let unit: { start: number; end: number } | null = null;
      const before = /\\unit\{(?:[^{}]|\{[^{}]*\})*\}$/.exec(prefix);
      const after = /^\\unit\{(?:[^{}]|\{[^{}]*\})*\}/.exec(suffix);
      if (fraction !== null && before) {
        unit = { start: offsetAfter(prefix.slice(0, before.index)), end: caret };
      } else if (fraction !== null && after) {
        unit = { start: caret, end: offsetAfter(prefix + after[0]) };
      }
      mf.value = unitsAsBrackets(full);
      if (unit) {
        // Inside its brackets for now, at the end nearer the click.
        caret = (fraction ?? 0) >= 0.5 ? unit.end - 1 : unit.start + 1;
      }
      caret = Math.max(0, Math.min(caret, mf.lastOffset));
      mf.position = caret;
      applying = false;
      callbacks.current.onChange(mf.value);
      // Then, once the brackets are drawn: the position inside the unit as far across as the
      // click was across the drawn unit (between letters, before a power, …).
      if (unit && fraction !== null) {
        const { start, end } = unit;
        requestAnimationFrame(() => {
          if (!mf.hasFocus() || mf.position !== caret) return; // moved on meanwhile
          const xs: { k: number; x: number }[] = [];
          for (let k = start + 1; k <= end - 1; k++) {
            const b = mf.getElementInfo(k)?.bounds;
            if (b) xs.push({ k, x: b.right });
          }
          const first = xs[0];
          const last = xs.at(-1);
          if (!first || !last) return;
          const target = first.x + fraction * (last.x - first.x);
          let best = first;
          for (const p of xs) if (Math.abs(p.x - target) < Math.abs(best.x - target)) best = p;
          mf.position = best.k;
        });
      }
    };
    const onFocusIn = () => {
      callbacks.current.onFocus?.();
      // After MathLive has placed the caret for the click that focused the row.
      setTimeout(unitsToBrackets, 0);
    };
    const onFocusOut = () => {
      setMenu(null);
      callbacks.current.onBlur?.();
    };

    mf.addEventListener('input', onInput);
    mf.addEventListener('beforeinput', onBeforeInput);
    mf.addEventListener('keydown', onKeyDown, { capture: true });
    mf.addEventListener('move-out', onMoveOut);
    mf.addEventListener('pointerdown', onPointerDown);
    mf.addEventListener('focusin', onFocusIn);
    mf.addEventListener('focusout', onFocusOut);
    // The math keyboard's \ switches MathLive to its LaTeX mode (before any input event; a
    // physical \ never gets here, onKeyDown opens the menu first): back to math, and our menu.
    const onModeChange = () => {
      if (mf.mode !== 'latex') return;
      // After MathLive has finished the keystroke (it enters LaTeX mode, then types the \).
      setTimeout(() => {
        if (mf.mode !== 'latex') return;
        applying = true;
        mf.executeCommand(['switchMode', 'math']);
        // The \ it typed stays behind as a character (or a line break \\): remove it.
        const typedBackslash = mf.getValue(mf.position - 1, mf.position, 'latex');
        if (/^\\{1,2}$|backslash/.test(typedBackslash)) mf.executeCommand('deleteBackward');
        applying = false;
        typed = '';
        fired = null;
        spelling = null;
        callbacks.current.onChange(mf.value);
        openMenu();
      }, 0);
    };
    mf.addEventListener('mode-change', onModeChange);
    fieldRef.current = mf;

    return () => {
      mf.removeEventListener('input', onInput);
      mf.removeEventListener('beforeinput', onBeforeInput);
      mf.removeEventListener('keydown', onKeyDown, { capture: true });
      mf.removeEventListener('move-out', onMoveOut);
      mf.removeEventListener('pointerdown', onPointerDown);
      mf.removeEventListener('focusin', onFocusIn);
      mf.removeEventListener('focusout', onFocusOut);
      mf.removeEventListener('mode-change', onModeChange);
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

  // The error, marked under the part of the field it is about: after a pause (not while typing),
  // and only while the field shows the LaTeX the error was found in.
  const errorStart = error?.start;
  const errorEnd = error?.end;
  const errorLatex = error?.latex;
  useEffect(() => {
    const mf = fieldRef.current;
    const container = containerRef.current;
    if (!mf || !container || errorStart === undefined || errorEnd === undefined) return;
    const mark = document.createElement('div');
    mark.className = 'math-error-mark';
    mark.setAttribute('aria-hidden', 'true');
    const place = () => {
      mark.remove();
      if (mf.value !== errorLatex) return;
      const range = errorRange(mf.value, mf.lastOffset, (k) => mf.getValue(0, k, 'latex'), {
        start: errorStart,
        end: errorEnd,
      });
      const box = range && errorBox(mf, range.from, range.to);
      if (!box) return;
      const origin = container.getBoundingClientRect();
      mark.classList.toggle('point', range.from === range.to);
      mark.style.left = `${box.left - origin.left}px`;
      mark.style.width = `${box.right - box.left}px`;
      mark.style.top = `${box.bottom - origin.top}px`;
      container.append(mark);
    };
    const timer = setTimeout(place, 400);
    const hide = () => {
      mark.remove();
    };
    mf.addEventListener('input', hide);
    window.addEventListener('resize', place);
    return () => {
      clearTimeout(timer);
      mark.remove();
      mf.removeEventListener('input', hide);
      window.removeEventListener('resize', place);
    };
  }, [errorStart, errorEnd, errorLatex, value]);

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

/**
 * Where an error covering positions (from, to] is drawn (viewport coordinates): the atoms'
 * boxes joined, or a short mark just after position `from` for a point (something missing).
 */
function errorBox(
  mf: MathfieldElement,
  from: number,
  to: number,
): { left: number; right: number; bottom: number } | null {
  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  if (from === to) {
    const at = mf.getElementInfo(from)?.bounds ?? mf.getElementInfo(from + 1)?.bounds;
    if (!at) return null;
    const x = from === 0 ? at.left : at.right;
    return { left: x, right: x + 8, bottom: at.bottom };
  }
  for (let k = from + 1; k <= to; k++) {
    const b = mf.getElementInfo(k)?.bounds;
    if (!b || b.width === 0) continue;
    left = Math.min(left, b.left);
    right = Math.max(right, b.right);
    bottom = Math.max(bottom, b.bottom);
  }
  return Number.isFinite(left) ? { left, right, bottom } : null;
}

/**
 * MathLive's model, which its public API does not expose: only what matrix editing needs (the
 * caret's atom, its parent array and cell). Checked for at runtime, so an upgrade that changes it
 * turns matrix keys off instead of breaking typing.
 */
interface InternalAtom {
  type?: string;
  parent?: InternalAtom;
  parentBranch?: unknown;
}
interface InternalArray extends InternalAtom {
  rowCount: number;
  colCount: number;
  getCell(row: number, column: number): InternalAtom[] | undefined;
}
interface InternalModel {
  position: number;
  at(offset: number): InternalAtom | undefined;
  offsetOf(atom: InternalAtom): number;
}

function internalModel(mf: MathfieldElement): InternalModel | null {
  const model = (mf as unknown as { _mathfield?: { model?: InternalModel } })._mathfield?.model;
  return typeof model?.at === 'function' && typeof model.offsetOf === 'function' ? model : null;
}

/** Puts the caret at the end of a matrix entry, or selects its empty box so typing fills it. */
function moveToCell(mf: MathfieldElement, array: InternalArray, row: number, col: number): boolean {
  const model = internalModel(mf);
  const atoms = array.getCell(row, col);
  const first = atoms?.[0];
  const last = atoms?.[atoms.length - 1];
  if (!model || !first || !last) return false;
  if (isEmptyCell(atoms) && first !== last) {
    mf.selection = {
      ranges: [[model.offsetOf(first), model.offsetOf(last)]],
      direction: 'forward',
    };
  } else {
    mf.position = model.offsetOf(last);
  }
  return true;
}

/** Puts an empty box in every matrix entry that has nothing in it (not even a box). */
function fillEmptyCells(mf: MathfieldElement, array: InternalArray): void {
  const model = internalModel(mf);
  if (!model) return;
  for (let r = 0; r < array.rowCount; r++) {
    for (let c = 0; c < array.colCount; c++) {
      const atoms = array.getCell(r, c);
      const first = atoms?.[0];
      if (first && atoms.every((a) => a.type === 'first')) {
        mf.position = model.offsetOf(first);
        mf.insert('\\placeholder{}', { selectionMode: 'after' });
      }
    }
  }
}

/** The matrix, row and column the caret is directly in (not inside a fraction in a cell). */
function matrixCell(
  mf: MathfieldElement,
): { array: InternalArray; row: number; col: number } | null {
  const model = internalModel(mf);
  if (!model) return null;
  const atom = model.at(model.position);
  const parent = atom?.parent;
  const branch = atom?.parentBranch;
  if (parent?.type !== 'array' || !Array.isArray(branch)) return null;
  const [row, col] = branch as unknown[];
  if (typeof row !== 'number' || typeof col !== 'number') return null;
  const array = parent as InternalArray;
  return typeof array.getCell === 'function' ? { array, row, col } : null;
}

const isEmptyCell = (cell: InternalAtom[] | undefined) =>
  !cell || cell.every((a) => a.type === 'first' || a.type === 'placeholder');

/**
 * Whether a point is on a unit as drawn: between a pair of its faint brackets (on a bracket
 * itself counts as beside the unit, so a click at the end of a row stays after it).
 */
function pointOnUnit(mf: MathfieldElement, x: number, y: number): number | null {
  const brackets = [...(mf.shadowRoot?.querySelectorAll('.ML-unit-bracket') ?? [])].map((b) =>
    b.getBoundingClientRect(),
  );
  for (let k = 0; k + 1 < brackets.length; k += 2) {
    const open = brackets[k];
    const close = brackets[k + 1];
    // On the unit, its brackets included (a click on a bracket puts the caret at that end).
    if (open && close && x >= open.left && x <= close.right && y >= open.top && y <= open.bottom) {
      const width = close.left - open.right;
      return width > 0 ? Math.min(1, Math.max(0, (x - open.right) / width)) : 0;
    }
  }
  return null;
}

let keyboardWatched = false;
/**
 * The math keyboard covers the bottom of the window: pad the page by its height so the last
 * rows can scroll above it, and bring the focused row into view when it opens.
 */
function keepRowsAboveKeyboard() {
  if (keyboardWatched) return;
  keyboardWatched = true;
  const keyboard = window.mathVirtualKeyboard;
  // MathSlate's own layers (keyboardLayouts.ts) instead of MathLive's defaults.
  keyboard.layouts = KEYBOARD_LAYOUTS;
  keyboard.addEventListener('geometrychange', () => {
    const height = keyboard.visible ? keyboard.boundingRect.height : 0;
    document.body.style.paddingBottom = height > 0 ? `${height}px` : '';
    if (height > 0) {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement) focused.scrollIntoView({ block: 'nearest' });
    }
  });
}

/** Keys that turn an empty math row into something else: " a note, # a heading, @ a folder. */
const EMPTY_ROW_KEYS: Partial<Record<string, EditorKeyAction>> = {
  '"': 'toNote',
  '#': 'toHeading',
  '@': 'toFolder',
};

/**
 * A word shortcut that just fired: by MathLive (undo reverts it) or by us; `span` is where we put
 * what it inserted (offsets), when we applied it for the math keyboard; `restore` undoes an
 * automatic subscript (the field before it, and the digit to type plainly instead).
 */
interface Fired {
  key: string;
  by: 'mathlive' | 'us';
  span?: { start: number; length: number };
  restore?: { value: string; position: number; insert: string };
}

/** MathLive's atoms, as far as automatic subscripts need them (checked at runtime). */
type ScriptAtom = InternalAtom & {
  value?: unknown;
  subscript?: ScriptAtom[];
  superscript?: ScriptAtom[];
  leftSibling?: ScriptAtom;
  rightSibling?: ScriptAtom;
};

/** A letter: italic, upright or Greek (not a function name like \sin). */
const isLetter = (a: ScriptAtom | undefined) =>
  a?.type === 'mord' && typeof a.value === 'string' && /^\p{L}$/u.test(a.value);

/**
 * Where a digit typed now goes as a subscript (x1 → x₁, x₁2 → x₁₂): 'new' after a letter
 * without a subscript or power, or the end of the all-digit subscript of a letter the caret is
 * just after. Null when it is an ordinary digit, also inside a subscript or power, or inside
 * square brackets (a unit).
 */
function subscriptTarget(
  mf: MathfieldElement,
): 'new' | { end: number; digits: number; letter: number } | null {
  const model = internalModel(mf);
  if (!model || !mf.selectionIsCollapsed) return null;
  const atom = model.at(model.position) as ScriptAtom | undefined;
  if (!atom) return null;
  for (let a: InternalAtom | undefined = atom; a; a = a.parent) {
    if (a.parentBranch === 'subscript' || a.parentBranch === 'superscript') return null;
    const delim = (a.parent as { leftDelim?: unknown } | undefined)?.leftDelim;
    if (a.parent?.type === 'leftright' && (delim === '[' || delim === '\\lbrack')) return null;
  }
  if (isLetter(atom) && atom.rightSibling?.type !== 'subsup') return 'new';
  const digits = atom.subscript?.filter((a) => a.type !== 'first') ?? [];
  const last = digits.at(-1);
  const letter = atom.leftSibling;
  if (
    atom.type === 'subsup' &&
    !atom.superscript &&
    letter &&
    isLetter(letter) &&
    last &&
    digits.every((a) => typeof a.value === 'string' && /^\d$/.test(a.value))
  ) {
    return { end: model.offsetOf(last), digits: digits.length, letter: model.offsetOf(letter) };
  }
  return null;
}

/**
 * A key, from a physical keyboard (a KeyboardEvent) or the math keyboard (built from its input:
 * no modifiers), for the handlers that serve both.
 */
type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>;
const virtualKey = (key: string): KeyLike => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
});

/** Typed characters that end a call-only name without its brackets (letters handled apart). */
const BREAKS_CALL = /^[^A-Za-z(_^\s]$/;

const ARROWS: Partial<Record<string, 'left' | 'right' | 'up' | 'down'>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

interface MenuState {
  query: string;
  active: number;
  anchor: MenuAnchor;
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
