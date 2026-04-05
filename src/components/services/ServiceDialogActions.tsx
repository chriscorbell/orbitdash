import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

interface ServiceDialogActionsProps {
  canSubmit: boolean;
  deleting: boolean;
  isEdit: boolean;
  onCancel: () => void;
  onDelete?: () => void;
  submitting: boolean;
}

export function ServiceDialogActions({
  canSubmit,
  deleting,
  isEdit,
  onCancel,
  onDelete,
  submitting,
}: ServiceDialogActionsProps) {
  return (
    <DialogFooter className="flex gap-2 sm:justify-between">
      {isEdit && onDelete && (
        <Button
          type="button"
          variant="destructive"
          onClick={onDelete}
          disabled={deleting}
          className="mr-auto"
        >
          {deleting ? "Deleting…" : "Delete"}
        </Button>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit || submitting}>
          {submitting ? "Saving…" : isEdit ? "Save changes" : "Add service"}
        </Button>
      </div>
    </DialogFooter>
  );
}
