import { type FormEvent, useState } from "react";
import type { Board, Category } from "../../shared/types.ts";
import { api } from "../api.ts";
import { Dialog } from "./Dialog.tsx";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface NameDialogProps {
  /** null adds a new category. */
  category: Category | null;
  onSaved: (board: Board) => void;
  onClose: () => void;
}

export function CategoryNameDialog({ category, onSaved, onClose }: NameDialogProps) {
  const [name, setName] = useState(category?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog title={category ? "Rename category" : "New category"} onClose={onClose}>
      {(close) => {
        async function submit(event: FormEvent) {
          event.preventDefault();
          setBusy(true);
          setError(null);
          try {
            onSaved(
              category
                ? await api.renameCategory(category.id, name)
                : await api.createCategory(name)
            );
            close();
          } catch (caught) {
            setError(message(caught));
            setBusy(false);
          }
        }

        return (
          <form onSubmit={submit}>
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={100}
                autoFocus
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-footer">
              <button type="button" className="button" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="button" data-variant="primary" disabled={busy}>
                {category ? "Rename" : "Add category"}
              </button>
            </div>
          </form>
        );
      }}
    </Dialog>
  );
}

interface DeleteDialogProps {
  category: Category;
  linkCount: number;
  onSaved: (board: Board) => void;
  onClose: () => void;
}

export function DeleteCategoryDialog({ category, linkCount, onSaved, onClose }: DeleteDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog title={`Delete ${category.name}?`} onClose={onClose}>
      {(close) => (
        <>
          <p className="dialog-text">
            {linkCount === 0
              ? "The category is empty."
              : `Its ${linkCount === 1 ? "link stays" : `${linkCount} links stay`} on the board, without a category.`}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-footer">
            <button type="button" className="button" onClick={close} autoFocus>
              Cancel
            </button>
            <button
              type="button"
              className="button"
              data-variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  onSaved(await api.deleteCategory(category.id));
                  close();
                } catch (caught) {
                  setError(message(caught));
                  setBusy(false);
                }
              }}
            >
              Delete category
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
