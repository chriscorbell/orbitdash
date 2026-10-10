// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditableBoard, type EditableBoardProps } from "@/components/board/EditableBoard";
import type { BoardGroup } from "@/lib/board-groups";
import type { Service } from "@shared/types";

afterEach(() => cleanup());

const plex: Service = {
  id: "plex",
  name: "Plex",
  url: "https://plex.example.com",
  description: "Movies",
  icon: null,
  icon_source_url: null,
  category: "Media",
  category_id: "media",
  position: 0,
  open_in_new_tab: true,
  created_at: 1,
  updated_at: 1,
};
const loose: Service = { ...plex, id: "loose", name: "Loose", category: null, category_id: null };

const groups: BoardGroup[] = [
  { key: "media", categoryId: "media", name: "Media", services: [plex] },
  { key: "empty", categoryId: "empty", name: "Empty", services: [] },
  { key: "uncategorized", categoryId: null, name: "Uncategorized", services: [loose] },
];

function Harness(props: Partial<EditableBoardProps>) {
  const [renamingKey, setRenamingKey] = useState<string | null>(props.renamingKey ?? null);
  return (
    <EditableBoard
      density="comfortable"
      groups={groups}
      mode="rows"
      onAddService={vi.fn()}
      onDeleteCategory={vi.fn()}
      onDeleteService={vi.fn()}
      onDuplicateService={vi.fn()}
      onEditService={vi.fn()}
      onMoveService={vi.fn()}
      onRenameCategory={vi.fn()}
      onReorderCategories={vi.fn()}
      {...props}
      renamingKey={renamingKey}
      onRenamingKeyChange={(key) => {
        setRenamingKey(key);
        props.onRenamingKeyChange?.(key);
      }}
    />
  );
}

describe("EditableBoard", () => {
  it("shows every category with a move handle and an add tile, uncategorized without controls", () => {
    render(<Harness />);

    expect(screen.getByRole("button", { name: "Move Media category" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Move Empty category" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Move Uncategorized category" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rename Uncategorized category" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Add a service to/ })).toHaveLength(3);
  });

  it("renames a category in place with Enter", async () => {
    const user = userEvent.setup();
    const onRenameCategory = vi.fn();
    render(<Harness onRenameCategory={onRenameCategory} />);

    await user.click(screen.getByRole("button", { name: "Rename Media category" }));
    const input = screen.getByRole("textbox", { name: "Category name" });
    expect(document.activeElement).toBe(input);
    await user.clear(input);
    await user.type(input, "Movies{Enter}");

    expect(onRenameCategory).toHaveBeenCalledWith("media", "Movies");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("keeps the name on Escape, on blur without changes, or when emptied", async () => {
    const user = userEvent.setup();
    const onRenameCategory = vi.fn();
    render(<Harness onRenameCategory={onRenameCategory} />);

    await user.click(screen.getByRole("button", { name: "Rename Media category" }));
    await user.type(screen.getByRole("textbox"), "x{Escape}");
    await user.click(screen.getByRole("button", { name: "Rename Media category" }));
    fireEvent.blur(screen.getByRole("textbox"));
    await user.click(screen.getByRole("button", { name: "Rename Media category" }));
    await user.clear(screen.getByRole("textbox"));
    await user.keyboard("{Enter}");

    expect(onRenameCategory).not.toHaveBeenCalled();
  });

  it("opens a just-created category's name for editing", () => {
    render(<Harness renamingKey="empty" />);
    expect((screen.getByRole("textbox", { name: "Category name" }) as HTMLInputElement).value).toBe(
      "Empty"
    );
  });

  it("deletes categories and adds services to them", async () => {
    const user = userEvent.setup();
    const onDeleteCategory = vi.fn();
    const onAddService = vi.fn();
    render(<Harness onDeleteCategory={onDeleteCategory} onAddService={onAddService} />);

    await user.click(screen.getByRole("button", { name: "Delete Media category" }));
    await user.click(screen.getByRole("button", { name: "Add a service to Empty" }));

    expect(onDeleteCategory).toHaveBeenCalledWith(groups[0]);
    expect(onAddService).toHaveBeenCalledWith(groups[1]);
  });

  it("opens a card's editor on click or Enter instead of following the link", async () => {
    const user = userEvent.setup();
    const onEditService = vi.fn();
    render(<Harness onEditService={onEditService} />);

    expect(screen.queryByRole("link")).toBeNull();
    const card = screen.getByRole("button", { name: /^Plex\. Press Enter to edit/ });
    await user.click(card);
    card.focus();
    await user.keyboard("{Enter}");

    expect(onEditService).toHaveBeenCalledTimes(2);
    expect(onEditService).toHaveBeenCalledWith(plex);
  });

  it("offers edit, duplicate and delete from each card's menu", async () => {
    const user = userEvent.setup();
    const onDuplicateService = vi.fn();
    const onDeleteService = vi.fn();
    render(<Harness onDuplicateService={onDuplicateService} onDeleteService={onDeleteService} />);

    await user.click(screen.getByRole("button", { name: "Actions for Plex" }));
    await user.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    await user.click(screen.getByRole("button", { name: "Actions for Plex" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

    expect(onDuplicateService).toHaveBeenCalledWith(plex);
    expect(onDeleteService).toHaveBeenCalledWith(plex);
  });
});
