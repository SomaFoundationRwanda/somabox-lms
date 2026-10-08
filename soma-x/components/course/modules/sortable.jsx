"use client";

// Teacher-only drag-and-drop for the modules page. Kept in its own module and loaded
// lazily (React.lazy) so learners never download dnd-kit.
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, arrayMove, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Calls render(row, dnd) with the props a row needs to be draggable.
function SortableRow({ id, row, render }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return render(row, {
    setNodeRef,
    attributes,
    listeners,
    isDragging,
    style: { transform: CSS.Transform.toString(transform), transition },
  });
}

// rows: objects with an `id`. onReorder(newIds) is called after a drop that changed the order.
function SortableList({ rows, onReorder, render, distance }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance } }),
    useSensor(KeyboardSensor)
  );
  const ids = rows.map((r) => r.id);

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id));
    onReorder(next);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {rows.map((row) => <SortableRow key={row.id} id={row.id} row={row} render={render} />)}
      </SortableContext>
    </DndContext>
  );
}

export function SortableModuleList({ modules, onReorder, renderModule }) {
  return <SortableList rows={modules} onReorder={onReorder} render={renderModule} distance={8} />;
}

export function SortableItemList({ items, onReorder, renderItem }) {
  return <SortableList rows={items} onReorder={onReorder} render={renderItem} distance={5} />;
}
