import { Check, FolderPlus, Pencil, Plus, X } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import type { Category, Layout, Link } from "../shared/types.ts";
import { api, ApiError } from "./api.ts";
import { Board } from "./components/Board.tsx";
import { applyLayout, layoutOf, moveCategory, sameLayout } from "./lib/board.ts";
import { useBoard } from "./useBoard.ts";

// Edit mode and the dialogs load on first use, so the startpage itself stays small. Edit mode
// starts loading when the pointer or focus reaches its button, so the click rarely waits.
const loadEditBoard = () => import("./components/EditBoard.tsx");
const EditBoard = lazy(loadEditBoard);
const LinkDialog = lazy(() =>
  import("./components/LinkDialog.tsx").then((module) => ({ default: module.LinkDialog }))
);
const CategoryNameDialog = lazy(() =>
  import("./components/CategoryDialogs.tsx").then((module) => ({
    default: module.CategoryNameDialog,
  }))
);
const DeleteCategoryDialog = lazy(() =>
  import("./components/CategoryDialogs.tsx").then((module) => ({
    default: module.DeleteCategoryDialog,
  }))
);

type DialogState =
  | { kind: "link"; link: Link | null; category?: string }
  | { kind: "category"; category: Category | null }
  | { kind: "delete-category"; category: Category };

export function App() {
  const { board, error, setBoard, reload } = useBoard();
  const [editing, setEditingState] = useState(false);
  // True until the first mode switch; the board's entrance animation only plays while it is.
  const [intro, setIntro] = useState(true);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  function setEditing(next: boolean) {
    setIntro(false);
    setEditingState(next);
  }
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function arrange(layout: Layout | null) {
    if (!board || !layout || sameLayout(layout, layoutOf(board))) return;
    setBoard(applyLayout(board, layout));
    try {
      setBoard(await api.arrange(layout));
    } catch (caught) {
      setNotice(caught instanceof ApiError ? caught.message : "The new order couldn't be saved.");
      void reload();
    }
  }

  function startAdding() {
    setEditing(true);
    setDialog({ kind: "link", link: null });
  }

  const closeDialog = () => setDialog(null);
  const isEmpty = board !== null && board.links.length === 0 && board.categories.length === 0;

  return (
    <div className="page">
      <header className="topbar">
        <span className="brand">
          <img src="/orbitdash.svg" alt="" width={20} height={22} />
          orbitdash
        </span>
        {board && !isEmpty && (
          <div className="toolbar" key={editing ? "editing" : "viewing"}>
            {editing ? (
              <>
                <button
                  type="button"
                  className="button"
                  aria-label="Add a link"
                  onClick={() => setDialog({ kind: "link", link: null })}
                >
                  <Plus aria-hidden="true" />
                  <span className="label">Link</span>
                </button>
                <button
                  type="button"
                  className="button"
                  aria-label="Add a category"
                  onClick={() => setDialog({ kind: "category", category: null })}
                >
                  <FolderPlus aria-hidden="true" />
                  <span className="label">Category</span>
                </button>
                <button
                  type="button"
                  className="button"
                  data-variant="primary"
                  onClick={() => setEditing(false)}
                >
                  <Check aria-hidden="true" />
                  Done
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button"
                data-variant="ghost"
                data-icon-only=""
                aria-label="Edit the board"
                title="Edit the board"
                onPointerEnter={() => void loadEditBoard()}
                onFocus={() => void loadEditBoard()}
                onClick={() => setEditing(true)}
              >
                <Pencil aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </header>

      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            className="button"
            data-variant="ghost"
            data-icon-only=""
            aria-label="Dismiss"
            onClick={() => setNotice(null)}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      <main data-intro={intro || undefined}>
        {!board ? (
          error && (
            <div className="empty">
              <p>The board couldn't be loaded. {error}</p>
              <button type="button" className="button" onClick={() => void reload()}>
                Try again
              </button>
            </div>
          )
        ) : isEmpty ? (
          <div className="empty">
            <p>No links yet.</p>
            <button type="button" className="button" data-variant="primary" onClick={startAdding}>
              <Plus aria-hidden="true" />
              Add a link
            </button>
          </div>
        ) : editing ? (
          <Suspense fallback={<Board board={board} />}>
            <EditBoard
              board={board}
              onArrange={(layout) => void arrange(layout)}
              onMoveCategory={(id, offset) => void arrange(moveCategory(board, id, offset))}
              onEditLink={(link) => setDialog({ kind: "link", link })}
              onAddLink={(category) => setDialog({ kind: "link", link: null, category })}
              onRenameCategory={(category) => setDialog({ kind: "category", category })}
              onDeleteCategory={(category) => setDialog({ kind: "delete-category", category })}
            />
          </Suspense>
        ) : (
          <Board board={board} />
        )}
      </main>

      <Suspense fallback={null}>
        {board && dialog?.kind === "link" && (
          <LinkDialog
            key={dialog.link?.id ?? "new"}
            link={dialog.link}
            category={dialog.category}
            categories={board.categories}
            onSaved={setBoard}
            onClose={closeDialog}
          />
        )}
        {dialog?.kind === "category" && (
          <CategoryNameDialog category={dialog.category} onSaved={setBoard} onClose={closeDialog} />
        )}
        {board && dialog?.kind === "delete-category" && (
          <DeleteCategoryDialog
            category={dialog.category}
            linkCount={board.links.filter((link) => link.categoryId === dialog.category.id).length}
            onSaved={setBoard}
            onClose={closeDialog}
          />
        )}
      </Suspense>
    </div>
  );
}
