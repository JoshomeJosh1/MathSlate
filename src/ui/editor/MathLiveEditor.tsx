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
    let pending: { char: string; before: string } | null = null;
    /** How the last keystroke's shortcut fired: by MathLive (undo reverts it) or by us. */
    let fired: { key: string; by: 'mathlive' | 'us' } | null = null;
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
      setMenu({ query: '', active: 0, anchor: { x, top: field.top, bottom: field.bottom } });
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

    /**
     * Growing a matrix as you type, as in [1, 2; 3, 4], with the caret in one of its cells: ";"
     * goes to the next row (adding one at the bottom), "," to the next entry (adding a column at
     * the end), and Backspace in an empty cell removes its row or column if it is all empty.
     * Returns whether it handled the key.
     */
    const matrixKey = (ev: KeyboardEvent): boolean => {
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
      if (fromKey || !(ev instanceof InputEvent)) return;
      if (ev.inputType === 'insertLineBreak') {
        ev.preventDefault();
        callbacks.current.onKeyAction?.('enter');
      } else if (ev.inputType === 'deleteContentBackward' && mf.value === '') {
        ev.preventDefault();
        callbacks.current.onKeyAction?.('backspaceEmpty');
      }
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
      } else if (last && bracketOnly?.has(last.key) && BREAKS_CALL.test(ev.key)) {
        // Anything but its brackets (or a subscript/power: Li_s, erf^{-1}) after a name that
        // needs them: "2Ai+1" is 2·A·i + 1, so the name goes back to letters before the key.
        revert(last);
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
    /** Where the last click was, if it landed on a unit's drawn brackets (see unitsToBrackets). */
    let clickedUnit = false;
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
      applying = true;
      mf.value = unitsAsBrackets(prefix);
      let caret = mf.lastOffset;
      // Clicked on a unit (the caret lands beside it): put the caret inside its brackets, at
      // the end of the unit if the click was on its right half, else at its start.
      if (clickedUnit && /\\unit\{(?:[^{}]|\{[^{}]*\})*\}$/.test(prefix)) caret -= 1;
      else if (clickedUnit && suffix.startsWith('\\unit{')) caret += 1;
      clickedUnit = false;
      mf.value = unitsAsBrackets(full);
      mf.position = Math.max(0, Math.min(caret, mf.lastOffset));
      applying = false;
      callbacks.current.onChange(mf.value);
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
    fieldRef.current = mf;

    return () => {
      mf.removeEventListener('input', onInput);
      mf.removeEventListener('beforeinput', onBeforeInput);
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
function pointOnUnit(mf: MathfieldElement, x: number, y: number): boolean {
  const brackets = [...(mf.shadowRoot?.querySelectorAll('.ML-unit-bracket') ?? [])].map((b) =>
    b.getBoundingClientRect(),
  );
  for (let k = 0; k + 1 < brackets.length; k += 2) {
    const open = brackets[k];
    const close = brackets[k + 1];
    if (open && close && x > open.right && x < close.left && y >= open.top && y <= open.bottom) {
      return true;
    }
  }
  return false;
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
