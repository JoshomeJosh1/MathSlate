import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { commands, type Command, type CommandContext } from '../../registries/commands';
import { MathEditor, type MathEditorHandle } from '../editor';

/**
 * The command palette for one row (Ctrl+/ or "/ more…"): search every command, the row's
 * suggestions first, and attach one with arguments. Arguments are fields pre-filled with the
 * row's defaults, or typed after the name in the search box ("diff y 2"); only the ones that
 * differ from the defaults are stored, so the rest keep following the row. Also edits the
 * arguments of a command already attached (click its output's title).
 */

export type PaletteMode =
  { kind: 'add' } | { kind: 'edit'; commandId: string; args: Readonly<Record<string, string>> };

interface Props {
  mode: PaletteMode;
  /** The row as commands see it (for argument defaults); null if no command can run on it. */
  context: CommandContext | null;
  /** Relevant commands for the row, most relevant first. */
  suggested: readonly Command[];
  onAttach: (commandId: string, args: Record<string, string>) => void;
  onClose: () => void;
}

/** Plain-text argument tokens as LaTeX: pi → \pi, oo → \infty, x->0+ → x\to0^{+}. */
function tokenLatex(token: string): string {
  return token
    .replace(/\bpi\b/g, '\\pi ')
    .replace(/\b(?:oo|inf|infinity)\b/g, '\\infty ')
    .replace(/->/g, '\\to ')
    .replace(/([0-9a-zA-Z}])([+-])$/, '$1^{$2}');
}

/** How well a command matches the search word (0: not at all). */
function matchScore(c: Command, word: string): number {
  if (word === '') return 1;
  const w = word.toLowerCase();
  if (c.slash.startsWith(w)) return 3;
  if (c.aliases?.some((a) => a.toLowerCase().startsWith(w))) return 2;
  return c.description.toLowerCase().includes(w) ? 1 : 0;
}

const defaultsOf = (c: Command, ctx: CommandContext | null): Record<string, string> =>
  Object.fromEntries((c.params ?? []).map((p) => [p.name, ctx ? p.default(ctx) : '']));

/** The arguments to store: those that differ from the row's defaults (and are not empty). */
function changedArgs(
  c: Command,
  values: Record<string, string>,
  ctx: CommandContext | null,
): Record<string, string> {
  const defaults = defaultsOf(c, ctx);
  const out: Record<string, string> = {};
  for (const p of c.params ?? []) {
    const v = (values[p.name] ?? '').trim();
    if (v !== (defaults[p.name] ?? '').trim() && !(p.optional && v === '')) out[p.name] = v;
  }
  return out;
}

export function CommandPalette({ mode, context, suggested, onAttach, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const editing = mode.kind === 'edit' ? commands.get(mode.commandId) : undefined;
  /** The command whose argument fields are shown, and their values. */
  const [chosen, setChosen] = useState<{ command: Command; values: Record<string, string> } | null>(
    editing
      ? {
          command: editing,
          values: { ...defaultsOf(editing, context), ...(mode.kind === 'edit' ? mode.args : {}) },
        }
      : null,
  );
  const searchRef = useRef<HTMLInputElement>(null);
  /** The argument fields' editors, in order (Tab moves between them). */
  const fieldRefs = useRef<(MathEditorHandle | null)[]>([]);

  const [word = '', ...tokens] = query.trim().split(/\s+/);
  const groups = useMemo(() => {
    const suggestedIds = new Set(suggested.map((c) => c.id));
    const match = (list: readonly Command[]) =>
      list
        .map((c) => ({ c, score: matchScore(c, word) }))
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((m) => m.c);
    const all = [...commands.values()]
      .filter((c) => !suggestedIds.has(c.id))
      .sort((a, b) => a.slash.localeCompare(b.slash));
    return [
      { title: 'Suggested for this row', items: match(suggested) },
      { title: 'All commands', items: match(all) },
    ].filter((g) => g.items.length > 0);
  }, [suggested, word]);
  const items = groups.flatMap((g) => g.items);

  // Focus the search box, or the first field when a command's fields open (once, not on every
  // keystroke in a field).
  const chosenId = chosen?.command.id;
  useEffect(() => {
    if (chosenId) fieldRefs.current[0]?.focus();
    else searchRef.current?.focus();
  }, [chosenId]);

  const pick = (c: Command) => {
    const params = c.params ?? [];
    const values = defaultsOf(c, context);
    tokens.forEach((t, k) => {
      const p = params[k];
      if (p) values[p.name] = tokenLatex(t);
    });
    // Arguments typed after the name, or none needed: attach at once. Otherwise show fields.
    if (params.length === 0 || tokens.length > 0) {
      onAttach(c.id, changedArgs(c, values, context));
      return;
    }
    setChosen({ command: c, values });
  };

  const onSearchKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (items.length === 0 ? 0 : (a + step + items.length) % items.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = items[active];
      if (c) pick(c);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (chosen) {
    const { command, values } = chosen;
    const submit = () => {
      onAttach(command.id, changedArgs(command, values, context));
    };
    return (
      <div
        className="command-palette"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div className="palette-heading">
          <span className="palette-command">/{command.slash}</span>
          <span className="muted">{command.description}</span>
        </div>
        <div
          className="palette-fields"
          onKeyDownCapture={(e) => {
            // Tab moves between the fields (the math editor would keep it for its own boxes).
            if (e.key !== 'Tab') return;
            const count = command.params?.length ?? 0;
            const at = fieldRefs.current.findIndex((_, k) =>
              e.currentTarget.children[k]?.contains(document.activeElement),
            );
            const next = at + (e.shiftKey ? -1 : 1);
            if (at < 0 || next < 0 || next >= count) return;
            e.preventDefault();
            e.stopPropagation();
            fieldRefs.current[next]?.focus();
          }}
        >
          {(command.params ?? []).map((p, k) => (
            <label key={p.name} className="palette-field">
              <span className="palette-label">
                {p.label}
                {p.optional && <span className="muted"> (optional)</span>}
              </span>
              <MathEditor
                ref={(handle) => {
                  fieldRefs.current[k] = handle;
                }}
                value={values[p.name] ?? ''}
                onChange={(latex) => {
                  setChosen({ command, values: { ...values, [p.name]: latex } });
                }}
                onKeyAction={(action) => {
                  if (action === 'enter') submit();
                  else if (action === 'escape') onClose();
                }}
                ariaLabel={`${command.slash}: ${p.label}`}
              />
            </label>
          ))}
        </div>
        <div className="palette-actions">
          <button className="palette-primary" onClick={submit}>
            {mode.kind === 'edit' ? 'Update' : 'Add'}
          </button>
          <button onClick={onClose}>Cancel</button>
          <span className="muted">
            Enter to {mode.kind === 'edit' ? 'update' : 'add'}, Esc to cancel
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="command-palette" role="dialog" aria-label="Commands">
      <input
        ref={searchRef}
        className="palette-search"
        placeholder={'Search commands — arguments after the name: "diff y 2"'}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onSearchKey}
        aria-label="Search commands"
      />
      <div className="palette-list" role="listbox">
        {groups.length === 0 && <div className="muted palette-empty">No command matches</div>}
        {groups.map((g) => (
          <div key={g.title}>
            <div className="palette-group">{g.title}</div>
            {g.items.map((c) => {
              const index = items.indexOf(c);
              const params = (c.params ?? []).map((p) => p.label).join(', ');
              return (
                <button
                  key={c.id}
                  role="option"
                  aria-selected={index === active}
                  className={`palette-item${index === active ? ' active' : ''}`}
                  onMouseEnter={() => {
                    setActive(index);
                  }}
                  onClick={() => {
                    pick(c);
                  }}
                >
                  <span className="palette-command">/{c.slash}</span>
                  {params && <span className="palette-params">{params}</span>}
                  <span className="palette-description">{c.description}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
