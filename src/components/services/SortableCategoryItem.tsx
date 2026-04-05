import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";

interface SortableCategoryItemProps {
  category: string;
  index: number;
  total: number;
  onMoveDown: () => void;
  onMoveUp: () => void;
}

export function SortableCategoryItem({
  category,
  index,
  total,
  onMoveDown,
  onMoveUp,
}: SortableCategoryItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 ${
        isDragging ? "shadow-md ring-1 ring-ring/30" : ""
      }`}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="cursor-grab active:cursor-grabbing"
        aria-label={`Drag to reorder ${category}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </Button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{category}</p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={onMoveUp}
          disabled={index === 0}
          aria-label={`Move ${category} up`}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={onMoveDown}
          disabled={index === total - 1}
          aria-label={`Move ${category} down`}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
