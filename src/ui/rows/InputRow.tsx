import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Ref } from 'react';
import type { InputRow as InputRowData } from '../../document/model';
import { MathEditor, type EditorKeyAction, type MathEditorHandle } from '../editor';

interface Props {
  row: InputRowData;
  index: number;
  showLatex: boolean;
  editorRef: Ref<MathEditorHandle>;
  onChange: (latex: string) => void;
  onKeyAction: (action: EditorKeyAction) => void;
  onDelete: () => void;
}

export function InputRow({
  row,
  index,
  showLatex,
  editorRef,
  onChange,
  onKeyAction,
  onDelete,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });

  return (
    <div
      ref={setNodeRef}
      className={`input-row${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="row-main">
        <button
          ref={setActivatorNodeRef}
          className="row-gutter"
          title="Drag to reorder"
          aria-label={`Row ${index + 1}, drag to reorder`}
          {...attributes}
          {...listeners}
        >
          {index + 1}
        </button>
        <MathEditor
          ref={editorRef}
          value={row.latex}
          onChange={onChange}
          onKeyAction={onKeyAction}
          ariaLabel={`Input row ${index + 1}`}
        />
        <button
          className="row-delete"
          title="Delete row"
          aria-label="Delete row"
          onClick={onDelete}
        >
          ×
        </button>
      </div>
      {showLatex && (
        <div className="row-latex" aria-label="LaTeX source">
          {row.latex === '' ? <span className="muted">(empty)</span> : row.latex}
        </div>
      )}
    </div>
  );
}
