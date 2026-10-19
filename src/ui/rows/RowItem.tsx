import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, type MouseEvent, type Ref } from 'react';
import { latexCompletions } from '../../core/completions';
import { bracketOnlyShortcuts, functionMacros } from '../../core/decorate';
import type { RowView } from '../../core/engine';
import type { InputRow } from '../../document/model';
import { commands, type Command } from '../../registries/commands';
import { MathEditor, type EditorKeyAction, type MathEditorHandle } from '../editor';
import { CommandPalette, type PaletteMode } from './CommandPalette';
import { NoteEditor } from './NoteEditor';
import { OutputRow } from './OutputRow';
import { RowDebug, RowError } from './RowDiagnostics';
import { SuggestionChips } from './SuggestionChips';

// Built-in functions display as single units (\lcm) and lcm/gcd/binomial need brackets.
const FUNCTION_MACROS = functionMacros();
const BRACKET_ONLY = bracketOnlyShortcuts();
// The `\` menu lists only commands MathSlate understands.
const COMPLETIONS = latexCompletions();

/** Which part of a dashed outline around several rows a row draws (top, sides, bottom). */
export type OutlinePiece = 'only' | 'first' | 'middle' | 'last';

interface Props {
  row: InputRow;
  view: RowView | undefined;
  /** Math rows' number (counting math rows only). */
  number: number;
  showDebug: boolean;
  focused: boolean;
  /** Shown indented, as a row of a folder. */
  inFolder: boolean;
  /** While dragging: this row's piece of the outline around the group the dragged row joins. */
  dropOutline: OutlinePiece | null;
  /** Folders: how many rows they hold (shown when collapsed). */
  folderSize: number;
  selected: boolean;
  /** Rows of a folder that is being dragged (they move with it). */
  movingWithFolder: boolean;
  editorRef: Ref<MathEditorHandle>;
  onChange: (latex: string) => void;
  onKeyAction: (action: EditorKeyAction) => void;
  onFocus: () => void;
  onBlur: () => void;
  /** Inline shortcuts for the math editor (defined multi-letter names → upright). */
  shortcuts: Readonly<Record<string, string>>;
  /** Click on the row number: Shift selects; on a folder, a plain click collapses/expands. */
  onGutterClick: (event: MouseEvent) => void;
  onDelete: () => void;
  onAddCommand: (command: Command, args?: Record<string, string>) => void;
  onSetOutputArgs: (outputId: string, args: Record<string, string>) => void;
  onRemoveOutput: (outputId: string) => void;
  /** Puts the caret back in the row (after the command palette closes). */
  onReturnFocus: () => void;
  onPromote: (latexRows: string[]) => void;
}

/**
 * One input row (math, note or folder title) with its diagnostics, output rows and suggestions;
 * drags as a unit.
 */
export function RowItem(props: Props) {
  const { row, view, number, showDebug, focused, editorRef } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id, transition: { duration: 150, easing: 'ease-out' } });
  /** The command palette, when open: adding a command, or editing an output's arguments. */
  const [palette, setPalette] = useState<(PaletteMode & { outputId?: string }) | null>(null);
  const closePalette = () => {
    setPalette(null);
    props.onReturnFocus();
  };
  const isNote = row.kind === 'note';
  const isFolder = row.kind === 'folder';
  const isMath = !row.kind;
  const classes = [
    'row-item',
    isDragging && 'dragging',
    isNote && 'note',
    isFolder && 'folder',
    isFolder && row.collapsed && 'collapsed',
    props.inFolder && 'in-folder',
    props.selected && 'selected',
    props.movingWithFolder && 'moving-with-folder',
    props.dropOutline && `drop-outline drop-${props.dropOutline}`,
  ].filter(Boolean);

  const gutterLabel = isFolder
    ? `Folder: ${row.collapsed ? 'expand' : 'collapse'} (click), drag to reorder`
    : `${isNote ? 'Note' : `Row ${number}`}, drag to reorder, Shift+click to select`;

  return (
    <div
      ref={setNodeRef}
      className={classes.join(' ')}
      data-row-id={row.id}
      // Translate only: dnd-kit's transform also scales a row to the size of the row it is over,
      // which stretches rows of different heights.
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div className="input-row">
        <button
          ref={setActivatorNodeRef}
          className="row-gutter"
          title={gutterLabel}
          aria-label={gutterLabel}
          aria-expanded={isFolder ? !row.collapsed : undefined}
          {...attributes}
          {...listeners}
          onClick={props.onGutterClick}
        >
          {isFolder ? (row.collapsed ? '▸' : '▾') : isNote ? '"' : number}
        </button>
        {isMath ? (
          <MathEditor
            ref={editorRef}
            value={row.latex}
            onChange={props.onChange}
            onKeyAction={(action) => {
              if (action === 'palette') setPalette({ kind: 'add' });
              else props.onKeyAction(action);
            }}
            onFocus={props.onFocus}
            onBlur={props.onBlur}
            shortcuts={props.shortcuts}
            macros={FUNCTION_MACROS}
            bracketOnly={BRACKET_ONLY}
            completions={COMPLETIONS}
            ariaLabel={`Input row ${number}`}
            error={view?.error?.span ? { latex: view.analysis.latex, ...view.error.span } : null}
          />
        ) : (
          <NoteEditor
            ref={editorRef}
            value={row.latex}
            onChange={props.onChange}
            onKeyAction={props.onKeyAction}
            onFocus={props.onFocus}
            variant={isFolder ? 'folder' : 'note'}
          />
        )}
        {isFolder && row.collapsed && (
          <span className="folder-size">
            {props.folderSize} {props.folderSize === 1 ? 'row' : 'rows'}
          </span>
        )}
        <button
          className="row-delete"
          title={isFolder ? 'Delete folder (keeps its rows)' : 'Delete row'}
          aria-label={isFolder ? 'Delete folder' : 'Delete row'}
          onClick={props.onDelete}
        >
          ×
        </button>
      </div>
      {isMath && view?.error && row.latex !== '' && (
        <RowError
          latex={row.latex}
          message={view.error.message}
          // The field marks where the error is; Debug also shows it in the LaTeX.
          {...(view.error.span && showDebug ? { span: view.error.span } : {})}
        />
      )}
      {isMath && showDebug && <RowDebug latex={row.latex} analysis={view?.analysis} />}
      {isMath && palette && (
        <CommandPalette
          mode={palette}
          context={view?.context ?? null}
          suggested={view?.suggestions.map((s) => s.command) ?? []}
          onAttach={(commandId, args) => {
            const outputId = palette.outputId;
            const command = commands.get(commandId);
            if (outputId) props.onSetOutputArgs(outputId, args);
            else if (command) props.onAddCommand(command, args);
            closePalette();
          }}
          onClose={closePalette}
        />
      )}
      {isMath &&
        view?.outputs.map((o) => (
          <OutputRow
            key={o.id}
            output={o}
            onPromote={props.onPromote}
            {...(o.commandId === 'auto'
              ? {}
              : {
                  onRemove: () => {
                    props.onRemoveOutput(o.id);
                  },
                })}
            {...(commands.get(o.commandId)?.params?.length
              ? {
                  onEditArgs: () => {
                    const spec = row.outputs.find((s) => s.id === o.id);
                    setPalette({
                      kind: 'edit',
                      commandId: o.commandId,
                      args: spec?.args ?? {},
                      outputId: o.id,
                    });
                  },
                }
              : {})}
          />
        ))}
      {isMath && focused && view && (
        <SuggestionChips
          suggestions={view.suggestions.slice(0, 5)}
          onPick={(command) => {
            props.onAddCommand(command);
          }}
          onMore={() => {
            setPalette({ kind: 'add' });
          }}
        />
      )}
    </div>
  );
}
