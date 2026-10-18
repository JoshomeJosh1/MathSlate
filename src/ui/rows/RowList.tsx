import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useEffect, useMemo, useRef } from 'react';
import { analyzeRows } from '../../core/analyze';
import { docActions, docStore } from '../../document/docStore';
import type { RowId } from '../../document/model';
import { useStore } from '../../document/store';
import type { EditorKeyAction, MathEditorHandle } from '../editor';
import { InputRow } from './InputRow';

export function RowList({ showDebug }: { showDebug: boolean }) {
  const doc = useStore(docStore);
  const analyses = useMemo(
    () => analyzeRows(doc.rows, { interpretationChoices: doc.interpretations }),
    [doc.rows, doc.interpretations],
  );
  const editors = useRef(new Map<RowId, MathEditorHandle>());
  // A row to focus once it has been rendered (e.g. one that was just inserted).
  const pendingFocus = useRef<RowId | null>(null);

  useEffect(() => {
    const id = pendingFocus.current;
    if (id === null) return;
    const editor = editors.current.get(id);
    if (editor) {
      pendingFocus.current = null;
      editor.focus();
    }
  });

  // `afterRender` defers focusing until the next commit; needed when the focused field is about
  // to be removed, otherwise MathLive cancels its (asynchronous) focus when the old field goes.
  const focusRow = (id: RowId | undefined, afterRender = false) => {
    if (id === undefined) return;
    const editor = editors.current.get(id);
    if (editor && !afterRender) editor.focus();
    else pendingFocus.current = id;
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) docActions.moveRow(String(active.id), String(over.id));
  };

  const handleKey = (id: RowId, index: number, action: EditorKeyAction) => {
    const prev = doc.rows[index - 1];
    const next = doc.rows[index + 1];
    switch (action) {
      case 'enter':
        focusRow(docActions.insertRowAfter(id));
        break;
      case 'backspaceEmpty':
        if (doc.rows.length > 1) {
          docActions.deleteRow(id);
          focusRow((prev ?? next)?.id, true);
        }
        break;
      case 'moveUp':
        focusRow(prev?.id);
        break;
      case 'moveDown':
        focusRow(next?.id);
        break;
    }
  };

  return (
    <div className="row-list">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={doc.rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          {doc.rows.map((row, index) => (
            <InputRow
              key={row.id}
              row={row}
              analysis={analyses[index]}
              index={index}
              showDebug={showDebug}
              editorRef={(handle) => {
                if (handle) editors.current.set(row.id, handle);
                else editors.current.delete(row.id);
              }}
              onChange={(latex) => {
                docActions.updateLatex(row.id, latex);
              }}
              onKeyAction={(action) => {
                handleKey(row.id, index, action);
              }}
              onDelete={() => {
                docActions.deleteRow(row.id);
              }}
            />
          ))}
        </SortableContext>
      </DndContext>
      <button
        className="add-row"
        onClick={() => {
          focusRow(docActions.insertRowAfter(null));
        }}
      >
        + Add row
      </button>
    </div>
  );
}
