import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

interface ServiceDialogActionsProps {
  canSubmit: boolean;
  deleting: boolean;
  isEdit: boolean;
  onCancel: () => void;
  /** Deletes right away; the toast that follows offers Undo, so there is no confirm step. */
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
    <DialogFooter className="flex-row flex-wrap items-center justify-end">
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
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={!canSubmit || submitting}>
        {submitting ? "Saving…" : isEdit ? "Save changes" : "Add service"}
      </Button>
    </DialogFooter>
  );
}
