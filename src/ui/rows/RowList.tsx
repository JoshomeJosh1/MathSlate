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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEngine } from '../../app/services';
import { decoratedRow, nameShortcuts } from '../../core/decorate';
import { docActions, docStore } from '../../document/docStore';
import type { RowId } from '../../document/model';
import { useStore } from '../../document/store';
import type { EditorKeyAction, MathEditorHandle } from '../editor';
import { RowItem } from './RowItem';

export function RowList({ showDebug }: { showDebug: boolean }) {
  const doc = useStore(docStore);
  const engine = useEngine();
  const editors = useRef(new Map<RowId, MathEditorHandle>());
  // Last focused row (keeps its suggestion chips visible) and the row currently being edited.
  const [focusedRow, setFocusedRow] = useState<RowId | null>(null);
  const [editingRow, setEditingRow] = useState<RowId | null>(null);

  // Show recognised multi-letter names upright. Never rewrite the row under the cursor (the
  // caret would jump); it is decorated as soon as the user leaves it.
  useEffect(() => {
    for (const row of doc.rows) {
      if (row.kind === 'note' || row.id === editingRow) continue;
      const next = decoratedRow(row.latex, engine.rows.get(row.id)?.analysis);
      if (next !== null) docActions.updateLatex(row.id, next);
    }
  }, [doc, engine, editingRow]);

  // Typing a defined multi-letter name turns it upright immediately. Stable identity per name set.
  const shortcutKey = JSON.stringify(
    nameShortcuts([...engine.rows.values()].map((v) => v.analysis)),
  );
  const shortcuts = useMemo(() => JSON.parse(shortcutKey) as Record<string, string>, [shortcutKey]);
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
            <RowItem
              key={row.id}
              row={row}
              view={engine.rows.get(row.id)}
              index={index}
              showDebug={showDebug}
              focused={focusedRow === row.id}
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
              onFocus={() => {
                setFocusedRow(row.id);
                setEditingRow(row.id);
              }}
              onBlur={() => {
                setEditingRow((current) => (current === row.id ? null : current));
              }}
              shortcuts={shortcuts}
              onDelete={() => {
                docActions.deleteRow(row.id);
              }}
              onAddCommand={(command) => {
                docActions.addOutput(row.id, command.id);
              }}
              onRemoveOutput={(outputId) => {
                docActions.removeOutput(row.id, outputId);
              }}
              onPromote={(latexRows) => {
                let after = row.id;
                for (const latex of latexRows) after = docActions.insertRowAfter(after, latex);
                focusRow(after);
              }}
            />
          ))}
        </SortableContext>
      </DndContext>
      <div className="add-buttons">
        <button
          className="add-row"
          onClick={() => {
            focusRow(docActions.insertRowAfter(null));
          }}
        >
          + Math
        </button>
        <button
          className="add-row"
          onClick={() => {
            focusRow(docActions.insertRowAfter(null, '', 'note'));
          }}
        >
          + Note
        </button>
      </div>
    </div>
  );
}
