import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableCategoryItem } from "@/components/services/SortableCategoryItem";

interface CategoryOrderListProps {
  order: string[];
  onMove: (category: string, direction: "up" | "down") => void;
  onReorder: (activeId: string, overId: string) => void;
}

// Loaded lazily from the settings dialog so dnd-kit stays out of the initial bundle.
export function CategoryOrderList({ order, onMove, onReorder }: CategoryOrderListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over) {
      onReorder(String(active.id), String(over.id));
    }
  };

  return (
    <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {order.map((category, index) => (
            <SortableCategoryItem
              key={category}
              category={category}
              index={index}
              total={order.length}
              onMoveUp={() => onMove(category, "up")}
              onMoveDown={() => onMove(category, "down")}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
