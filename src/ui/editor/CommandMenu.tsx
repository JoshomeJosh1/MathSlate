import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MathLiveView } from './MathLiveView';
import type { CommandCompletion } from './MathEditor';
import type { MenuLayout } from './matchCompletions';

/** Where the menu belongs: the caret's x, and the top and bottom of the math field (viewport). */
export interface MenuAnchor {
  x: number;
  top: number;
  bottom: number;
}

interface Props {
  query: string;
  layout: MenuLayout;
  active: number;
  anchor: MenuAnchor;
  /** LaTeX that displays each editor macro (`\lcm` → \operatorname{lcm}) for the previews. */
  macros: Readonly<Record<string, string>> | undefined;
  onPick: (item: CommandCompletion) => void;
}

const WIDTH = 400;
/** Space between the menu and the math field, and kept free at the window's edges. */
const GAP = 6;
const MARGIN = 8;

/**
 * The `\` menu: the commands MathSlate understands as a grid of tiles in groups, filtered by what
 * has been typed after the backslash. A tile's name and description show on hover. Keyboard
 * handling lives in the editor (the math field keeps focus); this only renders. Portalled to
 * <body> so a transformed (dragged) row cannot offset its fixed position.
 */
export function CommandMenu({ query, layout, active, anchor, macros, onPick }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  // Below the field if it fits, else on whichever side has more room (above, near the bottom of
  // the window), shrinking the list to fit. Measured before painting, on every render (the
  // height changes as the list is filtered).
  useLayoutEffect(() => {
    const menu = box.current;
    if (!menu) return;
    if (grid.current) grid.current.style.maxHeight = '';
    const below = window.innerHeight - anchor.bottom - GAP - MARGIN;
    const above = anchor.top - GAP - MARGIN;
    const natural = menu.offsetHeight;
    const placeBelow = natural <= below || below >= above;
    const room = placeBelow ? below : above;
    if (natural > room && grid.current) {
      grid.current.style.maxHeight = `${Math.max(80, grid.current.offsetHeight - (natural - room))}px`;
    }
    menu.style.top = `${placeBelow ? anchor.bottom + GAP : anchor.top - GAP - menu.offsetHeight}px`;
  });

  useLayoutEffect(() => {
    grid.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [active, query]);

  const current = layout.items[active];
  const left = Math.max(MARGIN, Math.min(anchor.x, window.innerWidth - WIDTH - MARGIN));
  return createPortal(
    <div
      ref={box}
      className="command-menu"
      style={{ left, width: WIDTH }}
      // Keep focus in the math field when the menu is clicked.
      onMouseDown={(e) => {
        e.preventDefault();
      }}
    >
      <div className="command-menu-query">
        <span>\{query}</span>
        {current && <span className="command-menu-current">\{current.name}</span>}
      </div>
      {layout.items.length === 0 ? (
        <div className="command-menu-empty">No command MathSlate recognises</div>
      ) : (
        <div className="command-menu-groups" ref={grid} role="listbox">
          {layout.groups.map((group) => (
            <section key={group.name}>
              <h3>{group.name}</h3>
              <div className={`command-menu-grid${group.wide ? ' wide' : ''}`}>
                {group.rows.flat().map((index) => {
                  const item = layout.items[index];
                  if (!item) return null;
                  return (
                    <div
                      key={item.name}
                      role="option"
                      aria-selected={index === active}
                      aria-label={`\\${item.name}: ${item.description}`}
                      title={`'\\${item.name}' - ${item.description}`}
                      className={`command-menu-tile${index === active ? ' is-active' : ''}`}
                      onClick={() => {
                        onPick(item);
                      }}
                    >
                      <MathLiveView latex={preview(item.display ?? item.latex, macros)} />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

function preview(latex: string, macros: Readonly<Record<string, string>> | undefined): string {
  return (
    latex
      .replace(/\\([A-Za-z]+)/g, (whole, name: string) => macros?.[name] ?? whole)
      // The static renderer draws nothing for an empty \placeholder{}.
      .replace(/#\?/g, '\\square')
  );
}
