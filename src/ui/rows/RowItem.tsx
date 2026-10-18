import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { MouseEvent, Ref } from 'react';
import { latexCompletions } from '../../core/completions';
import { bracketOnlyShortcuts, functionMacros } from '../../core/decorate';
import type { RowView } from '../../core/engine';
import type { InputRow } from '../../document/model';
import type { Command } from '../../registries/commands';
import { MathEditor, type EditorKeyAction, type MathEditorHandle } from '../editor';
import { NoteEditor } from './NoteEditor';
import { OutputRow } from './OutputRow';
import { RowDebug, RowError } from './RowDiagnostics';
import { SuggestionChips } from './SuggestionChips';

// Built-in functions display as single units (\lcm) and lcm/gcd/binomial need brackets.
const FUNCTION_MACROS = functionMacros();
const BRACKET_ONLY = bracketOnlyShortcuts();
// The `\` menu lists only commands MathSlate understands.
const COMPLETIONS = latexCompletions();

interface Props {
  row: InputRow;
  view: RowView | undefined;
  /** Math rows' number (counting math rows only). */
  number: number;
  showDebug: boolean;
  focused: boolean;
  /** Shown indented, as a row of a folder. */
  inFolder: boolean;
  /** While dragging: part of the folder the row would join, or the row it would group with. */
  dropHighlight: 'folder' | 'new' | null;
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
  onAddCommand: (command: Command) => void;
  onRemoveOutput: (outputId: string) => void;
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
    props.dropHighlight === 'folder' && 'drop-into',
    props.dropHighlight === 'new' && 'drop-new-folder',
  ].filter(Boolean);

  const gutterLabel = isFolder
    ? `Folder: ${row.collapsed ? 'expand' : 'collapse'} (click), drag to reorder`
    : `${isNote ? 'Note' : `Row ${number}`}, drag to reorder, Shift+click to select`;

  return (
    <div
      ref={setNodeRef}
      className={classes.join(' ')}
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
            onKeyAction={props.onKeyAction}
            onFocus={props.onFocus}
            onBlur={props.onBlur}
            shortcuts={props.shortcuts}
            macros={FUNCTION_MACROS}
            bracketOnly={BRACKET_ONLY}
            completions={COMPLETIONS}
            ariaLabel={`Input row ${number}`}
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
          {...(view.error.span ? { span: view.error.span } : {})}
        />
      )}
      {isMath && showDebug && <RowDebug latex={row.latex} analysis={view?.analysis} />}
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
          />
        ))}
      {isMath && focused && view && (
        <SuggestionChips suggestions={view.suggestions.slice(0, 5)} onPick={props.onAddCommand} />
      )}
    </div>
  );
}
