import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Ref } from 'react';
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
  index: number;
  showDebug: boolean;
  focused: boolean;
  editorRef: Ref<MathEditorHandle>;
  onChange: (latex: string) => void;
  onKeyAction: (action: EditorKeyAction) => void;
  onFocus: () => void;
  onBlur: () => void;
  /** Inline shortcuts for the math editor (defined multi-letter names → upright). */
  shortcuts: Readonly<Record<string, string>>;
  onDelete: () => void;
  onAddCommand: (command: Command) => void;
  onRemoveOutput: (outputId: string) => void;
  onPromote: (latexRows: string[]) => void;
}

/** One input row (math or note) with its diagnostics, output rows and suggestions; drags as a unit. */
export function RowItem(props: Props) {
  const { row, view, index, showDebug, focused, editorRef } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });
  const isNote = row.kind === 'note';

  return (
    <div
      ref={setNodeRef}
      className={`row-item${isDragging ? ' dragging' : ''}${isNote ? ' note' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="input-row">
        <button
          ref={setActivatorNodeRef}
          className="row-gutter"
          title="Drag to reorder"
          aria-label={`Row ${index + 1}, drag to reorder`}
          {...attributes}
          {...listeners}
        >
          {isNote ? '"' : index + 1}
        </button>
        {isNote ? (
          <NoteEditor
            ref={editorRef}
            value={row.latex}
            onChange={props.onChange}
            onKeyAction={props.onKeyAction}
            onFocus={props.onFocus}
          />
        ) : (
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
            ariaLabel={`Input row ${index + 1}`}
          />
        )}
        <button
          className="row-delete"
          title="Delete row"
          aria-label="Delete row"
          onClick={props.onDelete}
        >
          ×
        </button>
      </div>
      {!isNote && view?.error && row.latex !== '' && (
        <RowError
          latex={row.latex}
          message={view.error.message}
          {...(view.error.span ? { span: view.error.span } : {})}
        />
      )}
      {!isNote && showDebug && <RowDebug latex={row.latex} analysis={view?.analysis} />}
      {!isNote &&
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
      {!isNote && focused && view && (
        <SuggestionChips suggestions={view.suggestions.slice(0, 5)} onPick={props.onAddCommand} />
      )}
    </div>
  );
}
