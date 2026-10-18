import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEngine } from '../../app/services';
import { decoratedRow, functionShortcuts, nameShortcuts } from '../../core/decorate';
import { docActions, docStore } from '../../document/docStore';
import type { InputRow, RowId } from '../../document/model';
import { useStore } from '../../document/store';
import type { EditorKeyAction, MathEditorHandle } from '../editor';
import { dropTarget } from './dropTarget';
import { requestFocus, takeFocusRequest } from './focusRequest';
import { RowItem } from './RowItem';

const FUNCTION_SHORTCUTS = functionShortcuts();

/**
 * The row a dragged row is over: the one under the pointer (by the rows' positions when the drag
 * started), else the nearest (keyboard dragging, gaps). Comparing centres instead makes rows of
 * different heights swap back and forth.
 */
const rowUnderPointer: CollisionDetection = (args) => {
  const under = pointerWithin(args);
  return under.length > 0 ? under : closestCenter(args);
};

/** The pointer's x during a drag, or undefined for keyboard dragging. */
function pointerX({ activatorEvent, delta }: DragMoveEvent | DragEndEvent): number | undefined {
  return 'clientX' in activatorEvent && typeof activatorEvent.clientX === 'number'
    ? activatorEvent.clientX + delta.x
    : undefined;
}

export function RowList({ showDebug }: { showDebug: boolean }) {
  const doc = useStore(docStore);
  const engine = useEngine();
  const editors = useRef(new Map<RowId, MathEditorHandle>());
  // Last focused row (keeps its suggestion chips visible) and the row currently being edited.
  const [focusedRow, setFocusedRow] = useState<RowId | null>(null);
  const [editingRow, setEditingRow] = useState<RowId | null>(null);
  // Rows selected with Shift+click on their numbers (for grouping into a folder).
  const [selected, setSelected] = useState<ReadonlySet<RowId>>(new Set());
  // The row being dragged, and the folder it would land in (undefined: not over anything).
  const [dragging, setDragging] = useState<{ id: RowId; into?: RowId | null } | null>(null);

  const byId = useMemo(() => new Map(doc.rows.map((r) => [r.id, r])), [doc]);
  // Rows of collapsed folders are hidden (they still compute).
  const visible = useMemo(
    () => doc.rows.filter((r) => !(r.folder && byId.get(r.folder)?.collapsed)),
    [doc, byId],
  );
  // Math rows are numbered 1, 2, … through the whole slate (notes and folders are not).
  const numbers = useMemo(() => {
    const out = new Map<RowId, number>();
    for (const r of doc.rows) if (!r.kind) out.set(r.id, out.size + 1);
    return out;
  }, [doc]);
  const folderSizes = useMemo(() => {
    const sizes = new Map<RowId, number>();
    for (const r of doc.rows) if (r.folder) sizes.set(r.folder, (sizes.get(r.folder) ?? 0) + 1);
    return sizes;
  }, [doc]);

  // Show recognised multi-letter names upright. Never rewrite the row under the cursor (the
  // caret would jump); it is decorated as soon as the user leaves it.
  useEffect(() => {
    for (const row of doc.rows) {
      if (row.kind || row.id === editingRow) continue;
      const next = decoratedRow(row.latex, engine.rows.get(row.id)?.analysis);
      if (next !== null) docActions.updateLatex(row.id, next);
    }
  }, [doc, engine, editingRow]);

  // Typing a built-in function or a defined multi-letter name turns it upright immediately (a
  // definition wins over a built-in of the same name). Stable identity per name set.
  const shortcutKey = JSON.stringify({
    ...FUNCTION_SHORTCUTS,
    ...nameShortcuts([...engine.rows.values()].map((v) => v.analysis)),
  });
  const shortcuts = useMemo(() => JSON.parse(shortcutKey) as Record<string, string>, [shortcutKey]);
  // A row to focus once it has been rendered (e.g. one that was just inserted).
  const pendingFocus = useRef<RowId | null>(null);

  useEffect(() => {
    const requested = takeFocusRequest();
    if (requested !== null) pendingFocus.current = requested;
    const id = pendingFocus.current;
    if (id === null) return;
    const editor = editors.current.get(id);
    if (editor) {
      pendingFocus.current = null;
      editor.focus();
    }
  });

  // Escape clears the selection.
  useEffect(() => {
    if (selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [selected]);

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

  /** The folder the dragged row would land in, for the current pointer position. */
  const landing = (event: DragMoveEvent | DragEndEvent): RowId | null | undefined => {
    const active = byId.get(String(event.active.id));
    const over = event.over ? byId.get(String(event.over.id)) : undefined;
    if (!active || !over || !event.over) return undefined;
    return dropTarget(active, over, pointerX(event), event.over.rect);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const into = landing(event);
    if (event.over && into !== undefined) {
      docActions.moveRow(String(event.active.id), String(event.over.id), into);
    }
  };

  const toggleSelected = (id: RowId) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleKey = (row: InputRow, index: number, action: EditorKeyAction) => {
    const prev = visible[index - 1];
    const next = visible[index + 1];
    switch (action) {
      case 'enter':
        focusRow(docActions.insertRowAfter(row.id));
        break;
      case 'backspaceEmpty':
        if (doc.rows.length > 1) {
          docActions.deleteRow(row.id);
          focusRow((prev ?? next)?.id, true);
        }
        break;
      case 'moveUp':
        focusRow(prev?.id);
        break;
      case 'moveDown':
        focusRow(next?.id);
        break;
      case 'toNote':
      case 'toFolder':
        // The row's editor component is replaced, so focus the new one after rendering.
        docActions.setRowKind(row.id, action === 'toNote' ? 'note' : 'folder');
        focusRow(row.id, true);
        break;
      case 'toHeading':
        docActions.setRowKind(row.id, 'note');
        docActions.updateLatex(row.id, '# ');
        focusRow(row.id, true);
        break;
      case 'toMath':
        // Backspace in an empty note makes it math; in an empty folder title, removes the
        // folder (its rows stay).
        if (row.kind === 'folder') {
          docActions.deleteRow(row.id);
          focusRow((prev ?? next)?.id, true);
        } else {
          docActions.setRowKind(row.id, 'math');
          focusRow(row.id, true);
        }
        break;
    }
  };

  const groupSelected = () => {
    const id = docActions.groupRows([...selected]);
    setSelected(new Set());
    if (id) focusRow(id, true);
  };

  const draggedFolder = dragging && byId.get(dragging.id)?.kind === 'folder' ? dragging.id : null;

  return (
    <div className="row-list">
      <DndContext
        sensors={sensors}
        collisionDetection={rowUnderPointer}
        onDragStart={({ active }) => {
          setDragging({ id: String(active.id) });
        }}
        onDragMove={(event) => {
          const into = landing(event);
          setDragging((current) =>
            current && current.into !== into
              ? { id: current.id, ...(into === undefined ? {} : { into }) }
              : current,
          );
        }}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragging(null);
        }}
      >
        <SortableContext items={visible.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          {visible.map((row, index) => {
            const isDragged = dragging?.id === row.id;
            const inFolder =
              isDragged && dragging.into !== undefined ? dragging.into !== null : !!row.folder;
            return (
              <RowItem
                key={row.id}
                row={row}
                view={engine.rows.get(row.id)}
                number={numbers.get(row.id) ?? 0}
                showDebug={showDebug}
                focused={focusedRow === row.id}
                inFolder={inFolder}
                folderSize={folderSizes.get(row.id) ?? 0}
                selected={selected.has(row.id)}
                movingWithFolder={draggedFolder !== null && row.folder === draggedFolder}
                editorRef={(handle) => {
                  if (handle) editors.current.set(row.id, handle);
                  else editors.current.delete(row.id);
                }}
                onChange={(latex) => {
                  docActions.updateLatex(row.id, latex);
                }}
                onKeyAction={(action) => {
                  handleKey(row, index, action);
                }}
                onFocus={() => {
                  setFocusedRow(row.id);
                  setEditingRow(row.id);
                }}
                onBlur={() => {
                  setEditingRow((current) => (current === row.id ? null : current));
                }}
                shortcuts={shortcuts}
                onGutterClick={(e) => {
                  if (e.shiftKey) toggleSelected(row.id);
                  else if (row.kind === 'folder') docActions.setCollapsed(row.id, !row.collapsed);
                }}
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
            );
          })}
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
        <button
          className="add-row"
          onClick={() => {
            requestFocus(docActions.addFolder());
          }}
        >
          + Folder
        </button>
      </div>
      {selected.size > 0 && (
        <div className="selection-bar" role="toolbar" aria-label="Selected rows">
          <span>
            {selected.size} {selected.size === 1 ? 'row' : 'rows'} selected
          </span>
          <button onClick={groupSelected}>Group into folder</button>
          <button
            onClick={() => {
              setSelected(new Set());
            }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
