/**
 * How `\unit{km}` is drawn: upright, after a thin space, in faint square brackets (the class
 * `ML-unit-bracket` is styled in styles.css and inside each math field's shadow root). The
 * row's LaTeX keeps `\unit{…}`; this is display only.
 */
const bracket = (b: string) => `\\class{ML-unit-bracket}{${b}}`;

/** The editor macro's definition (`#1` is the unit's text). */
export const UNIT_MACRO = `\\,${bracket('[')}\\mathrm{#1}${bracket(']')}`;

/** For read-only rendering: replaces each `\unit{…}` with what the macro draws. */
export function expandUnitMacro(latex: string): string {
  return latex.replace(UNIT_PATTERN, (_, text: string) => UNIT_MACRO.replace('#1', text));
}

const UNIT_PATTERN = /\\unit\{((?:[^{}]|\{[^{}]*\})*)\}/g;

/**
 * Units as typed (`\unit{km}` → `[km]`), so they can be edited: a row's units take this form
 * while it is being edited, and decoration turns them back when it is left.
 */
export function unitsAsBrackets(latex: string): string {
  return latex.replace(UNIT_PATTERN, (_, text: string) => {
    const typed = text.replace(/µ/g, '\\mu ').replace(/Ω/g, '\\Omega ');
    return `\\left\\lbrack ${typed}\\right\\rbrack `;
  });
}

/** CSS for the brackets inside a math field's shadow root (page styles do not reach it). */
export const UNIT_SHADOW_CSS = '.ML-unit-bracket { color: var(--unit-bracket); }';
