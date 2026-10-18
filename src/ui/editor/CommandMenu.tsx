import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { CommandCompletion } from './MathEditor';
import { MathLiveView } from './MathLiveView';

interface Props {
  query: string;
  items: readonly CommandCompletion[];
  active: number;
  /** Viewport position under the caret. */
  anchor: { x: number; y: number };
  /** LaTeX that displays each editor macro (`\lcm` → \operatorname{lcm}) for the previews. */
  macros: Readonly<Record<string, string>> | undefined;
  onPick: (item: CommandCompletion) => void;
}

/**
 * The `\` menu: the commands MathSlate understands, filtered by what has been typed after the
 * backslash. Keyboard handling lives in the editor (the math field keeps focus); this renders.
 * Portalled to <body> so a transformed (dragged) row cannot offset its fixed position.
 */
export function CommandMenu({ query, items, active, anchor, macros, onPick }: Props) {
  const list = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    list.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [active, query]);

  const left = Math.max(8, Math.min(anchor.x, window.innerWidth - 368));
  return createPortal(
    <div
      className="command-menu"
      style={{ left, top: anchor.y + 6 }}
      // Keep focus in the math field when the menu is clicked.
      onMouseDown={(e) => {
        e.preventDefault();
      }}
    >
      <div className="command-menu-query">\{query}</div>
      {items.length === 0 ? (
        <div className="command-menu-empty">No command MathSlate recognises</div>
      ) : (
        <ul ref={list} role="listbox">
          {items.map((item, i) => (
            <li
              key={item.name}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : undefined}
              onClick={() => {
                onPick(item);
              }}
            >
              <MathLiveView className="command-menu-preview" latex={preview(item.latex, macros)} />
              <span className="command-menu-name">\{item.name}</span>
              <span className="command-menu-description">{item.description}</span>
            </li>
          ))}
        </ul>
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
