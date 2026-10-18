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
import { dropTarget, sameTarget, type DropTarget } from './dropTarget';
import { RowItem, type OutlinePiece } from './RowItem';

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

/**
 * Drop feedback, shown without changing any row's size (a size change would move the drop zones
 * under the pointer and make the target flicker): one dashed outline around the group the row
 * would end up in, an existing folder (title and rows) or the row it would make a new folder
 * with. Each row draws its piece of the outline; the result maps row id → piece.
 */
function dropOutline(
  rows: readonly InputRow[],
  activeId: RowId | undefined,
  target: DropTarget | undefined,
): Map<RowId, OutlinePiece> {
  const pieces = new Map<RowId, OutlinePiece>();
  if (!target) return pieces;
  const inGroup = (r: InputRow) =>
    'newFolderWith' in target
      ? r.id === target.newFolderWith
      : r.id === target.folder || r.folder === target.folder;
  // The dragged row follows the pointer, so it is not part of the outline.
  const group = rows.filter((r) => r.id !== activeId && inGroup(r));
  group.forEach((r, i) => {
    const first = i === 0;
    const last = i === group.length - 1;
    pieces.set(r.id, first && last ? 'only' : first ? 'first' : last ? 'last' : 'middle');
  });
  return pieces;
}

/** What dropping will do, shown on the dragged row; null when it stays where it is. */
function dragLabel(
  row: InputRow,
  target: DropTarget | undefined,
  byId: ReadonlyMap<RowId, InputRow>,
): string | null {
  if (target === undefined) return null;
  if (target === null) return row.folder ? 'Out of folder' : null;
  if ('newFolderWith' in target) return 'New folder';
  if (target.folder === row.folder) return null;
  const title = byId.get(target.folder)?.latex.trim();
  return title ? `Into ${title}` : 'Into folder';
}

/**
 * The pointer's position, tracked separately from the drag events: the drop target and the label
 * that follows the pointer are updated on every pointer move.
 */
let lastPointer: { x: number; y: number } | undefined;
window.addEventListener('pointermove', (e) => {
  lastPointer = { x: e.clientX, y: e.clientY };
});

/** The pointer's x during a drag, or undefined for keyboard dragging. */
function pointerX({ activatorEvent }: DragMoveEvent | DragEndEvent): number | undefined {
  // Pointer events are mouse events; keyboard dragging has no pointer.
  if (!(activatorEvent instanceof MouseEvent)) return undefined;
  return lastPointer?.x ?? activatorEvent.clientX;
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
  // The row being dragged, and where it would land (undefined: not over anything).
  const [dragging, setDragging] = useState<{ id: RowId; target?: DropTarget } | null>(null);

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
    const id = pendingFocus.current;
    if (id === null) return;
    const editor = editors.current.get(id);
    if (editor) {
      pendingFocus.current = null;
      editor.focus();
    }
  });

  // Esc anywhere in the slate lets go: it clears the selection, leaves whatever has focus (e.g. a
  // folder's arrow after clicking it; the editors handle Esc themselves first), and hides the
  // suggested commands.
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSelected((current) => (current.size > 0 ? new Set() : current));
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && list.current?.contains(focused)) focused.blur();
      setFocusedRow(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

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

  /** Where the dragged row would land, for the current pointer position. */
  const landing = (event: DragMoveEvent | DragEndEvent): DropTarget | undefined => {
    const active = byId.get(String(event.active.id));
    const over = event.over ? byId.get(String(event.over.id)) : undefined;
    if (!active || !over || !event.over) return undefined;
    return dropTarget(active, over, pointerX(event), event.over.rect);
  };

  // The latest drag event (what the row is over); the feedback is recomputed from it on every
  // pointer move, and the label follows the pointer.
  const lastDrag = useRef<DragMoveEvent | null>(null);
  const label = useRef<HTMLDivElement>(null);
  const placeLabel = () => {
    if (label.current && lastPointer) {
      label.current.style.transform = `translate(${lastPointer.x + 14}px, ${lastPointer.y + 16}px)`;
    }
  };
  const showLanding = (event: DragMoveEvent) => {
    lastDrag.current = event;
    const target = landing(event);
    setDragging((current) =>
      current && !sameTarget(current.target, target)
        ? { id: current.id, ...(target === undefined ? {} : { target }) }
        : current,
    );
  };
  const isDragging = dragging !== null;
  useEffect(() => {
    if (!isDragging) return;
    placeLabel();
    const onMove = () => {
      placeLabel();
      if (lastDrag.current) showLanding(lastDrag.current);
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
    };
  });

  const onDragEnd = (event: DragEndEvent) => {
    lastDrag.current = null;
    setDragging(null);
    const target = landing(event);
    if (!event.over || target === undefined) return;
    const id = String(event.active.id);
    if (target && 'newFolderWith' in target) {
      // A new folder with the row it was dropped on: name it straight away.
      focusRow(docActions.groupWith(target.newFolderWith, id) ?? undefined, true);
    } else {
      docActions.moveRow(id, String(event.over.id), target ? target.folder : null);
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
      case 'escape':
        // The row has been left: hide its suggested commands too.
        setFocusedRow(null);
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

  const draggedRow = dragging ? byId.get(dragging.id) : undefined;
  const draggedFolder = draggedRow?.kind === 'folder' ? draggedRow.id : null;
  const labelText = draggedRow ? dragLabel(draggedRow, dragging?.target, byId) : null;
  const outline = dropOutline(visible, dragging?.id, dragging?.target);

  return (
    <div className="row-list" ref={list}>
      <DndContext
        sensors={sensors}
        collisionDetection={rowUnderPointer}
        onDragStart={({ active }) => {
          setDragging({ id: String(active.id) });
        }}
        onDragMove={showLanding}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          lastDrag.current = null;
          setDragging(null);
        }}
      >
        <SortableContext items={visible.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          {visible.map((row, index) => {
            return (
              <RowItem
                key={row.id}
                row={row}
                view={engine.rows.get(row.id)}
                number={numbers.get(row.id) ?? 0}
                showDebug={showDebug}
                focused={focusedRow === row.id}
                inFolder={!!row.folder}
                dropOutline={outline.get(row.id) ?? null}
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
            focusRow(docActions.addFolder(), true);
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
      {labelText && (
        // What dropping will do, next to the pointer (positioned by placeLabel).
        <div ref={label} className="drag-label" role="status">
          {labelText}
        </div>
      )}
    </div>
  );
}
