import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RenameCategoryDialogProps {
  category: string | null;
  onOpenChange: (open: boolean) => void;
  onRename: (to: string) => Promise<void>;
}

interface RenameCategoryFormProps {
  category: string;
  onCancel: () => void;
  onRename: (to: string) => Promise<void>;
}

function RenameCategoryForm({ category, onCancel, onRename }: RenameCategoryFormProps) {
  const [name, setName] = useState(category);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && trimmedName !== category && !saving;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onRename(trimmedName);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Failed to rename category");
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="rename-category-name">Category name</Label>
        <Input
          id="rename-category-name"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          All services in {category} move to the new name.
        </p>
      </div>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave}>
          {saving ? "Renaming…" : "Rename"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RenameCategoryDialog({
  category,
  onOpenChange,
  onRename,
}: RenameCategoryDialogProps) {
  return (
    <Dialog open={category !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename category</DialogTitle>
          <DialogDescription>Pick a new name for this category.</DialogDescription>
        </DialogHeader>
        {category !== null && (
          <RenameCategoryForm
            key={category}
            category={category}
            onCancel={() => onOpenChange(false)}
            onRename={onRename}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
