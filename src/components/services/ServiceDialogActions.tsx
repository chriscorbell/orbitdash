import { useEffect, useId, useRef, useState } from "react";
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

type DeleteStep = "idle" | "confirming" | "dismissed";

export function ServiceDialogActions({
  canSubmit,
  deleting,
  isEdit,
  onCancel,
  onDelete,
  submitting,
}: ServiceDialogActionsProps) {
  const [deleteStep, setDeleteStep] = useState<DeleteStep>("idle");
  const confirmPromptId = useId();
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const cancelDeleteButtonRef = useRef<HTMLButtonElement>(null);
  const canDelete = isEdit && onDelete !== undefined;

  // The button that was clicked unmounts on each step, so move focus to its counterpart.
  useEffect(() => {
    if (deleteStep === "confirming") {
      cancelDeleteButtonRef.current?.focus();
    } else if (deleteStep === "dismissed") {
      deleteButtonRef.current?.focus();
    }
  }, [deleteStep]);

  if (canDelete && deleteStep === "confirming") {
    return (
      <DialogFooter
        key="confirm-delete"
        role="group"
        aria-labelledby={confirmPromptId}
        className="flex-row flex-wrap items-center justify-end duration-150 animate-in fade-in-0 slide-in-from-bottom-1"
      >
        <p id={confirmPromptId} className="mr-auto text-sm font-medium">
          Delete this service?
        </p>
        <Button
          ref={cancelDeleteButtonRef}
          type="button"
          variant="outline"
          onClick={() => setDeleteStep("dismissed")}
          disabled={deleting}
        >
          Cancel
        </Button>
        <Button type="button" variant="destructive" onClick={onDelete} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete"}
        </Button>
      </DialogFooter>
    );
  }

  return (
    <DialogFooter key="actions" className="flex-row flex-wrap items-center justify-end">
      {canDelete && (
        <Button
          ref={deleteButtonRef}
          type="button"
          variant="destructive"
          onClick={() => setDeleteStep("confirming")}
          className="mr-auto"
        >
          Delete
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
