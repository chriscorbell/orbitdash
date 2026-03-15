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
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SortableCategoryItem } from "@/components/services/SortableCategoryItem";

interface CategoryReorderDialogProps {
    draftOrder: string[];
    error: string | null;
    open: boolean;
    saving: boolean;
    onMoveCategory: (category: string, direction: "up" | "down") => void;
    onOpenChange: (open: boolean) => void;
    onReorder: (activeId: string, overId: string) => void;
    onSave: () => void;
}

export function CategoryReorderDialog({
    draftOrder,
    error,
    open,
    saving,
    onMoveCategory,
    onOpenChange,
    onReorder,
    onSave,
}: CategoryReorderDialogProps) {
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 6,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) {
            return;
        }

        onReorder(String(active.id), String(over.id));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Reorder categories</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <DndContext
                        collisionDetection={closestCenter}
                        sensors={sensors}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={draftOrder}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-2">
                                {draftOrder.map((category, index) => (
                                    <SortableCategoryItem
                                        key={category}
                                        category={category}
                                        index={index}
                                        total={draftOrder.length}
                                        onMoveDown={() => onMoveCategory(category, "down")}
                                        onMoveUp={() => onMoveCategory(category, "up")}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                    {error && (
                        <p className="text-sm font-medium text-destructive">
                            {error}
                        </p>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={onSave}
                            disabled={saving}
                        >
                            {saving ? "Saving..." : "Save"}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}
