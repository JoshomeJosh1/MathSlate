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
  return latex.replace(/\\unit\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_, text: string) =>
    UNIT_MACRO.replace('#1', text),
  );
}

/** CSS for the brackets inside a math field's shadow root (page styles do not reach it). */
export const UNIT_SHADOW_CSS = '.ML-unit-bracket { color: var(--unit-bracket); }';
