import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Service } from "@shared/types";

interface DeleteServiceDialogProps {
  deleting: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  service: Service | null;
}

export function DeleteServiceDialog({
  deleting,
  onConfirm,
  onOpenChange,
  service,
}: DeleteServiceDialogProps) {
  return (
    <Dialog open={service !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete service</DialogTitle>
          <DialogDescription>
            Confirm service deletion before removing it permanently.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete{" "}
          <span className="font-medium text-foreground">{service?.name}</span>? This cannot be
          undone.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
