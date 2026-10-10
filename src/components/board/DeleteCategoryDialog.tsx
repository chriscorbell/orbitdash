import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BoardGroup } from "@/lib/board-groups";

interface DeleteCategoryDialogProps {
  group: BoardGroup | null;
  onConfirm: (group: BoardGroup) => void;
  onOpenChange: (open: boolean) => void;
}

/** Confirms deleting a category that still has services; they become uncategorized. */
export function DeleteCategoryDialog({
  group,
  onConfirm,
  onOpenChange,
}: DeleteCategoryDialogProps) {
  const count = group?.services.length ?? 0;

  return (
    <Dialog open={group !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete {group?.name}?</DialogTitle>
          <DialogDescription>
            {count === 1
              ? "Its service moves to Uncategorized."
              : `Its ${count} services move to Uncategorized.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (group) onConfirm(group);
              onOpenChange(false);
            }}
          >
            Delete category
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
