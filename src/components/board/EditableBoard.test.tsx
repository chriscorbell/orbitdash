// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditableBoard, type EditableBoardProps } from "@/components/board/EditableBoard";
import { Toaster } from "@/components/ui/toaster";
import * as bulkApi from "@/lib/api/service-bulk";
import type { BoardGroup } from "@/lib/board-groups";
import { queryKeys } from "@/lib/query-client";
import { resetToastsForTesting } from "@/lib/toast";
import { createQueryWrapper } from "@/test/query";
import type { Category, Service } from "@shared/types";

vi.mock("@/lib/api/service-bulk", () => ({
  bulkDeleteServices: vi.fn(),
  bulkMoveServices: vi.fn(),
  bulkRestoreServices: vi.fn(),
  bulkUpdateServiceChecks: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  resetToastsForTesting();
});

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
  check_enabled: false,
  check_method: "http",
  check_target: null,
  check_interval: 60,
  check_ignore_tls: false,
  external_url: null,
  links: [],
  tags: [],
};
const loose: Service = { ...plex, id: "loose", name: "Loose", category: null, category_id: null };

const groups: BoardGroup[] = [
  { key: "media", categoryId: "media", name: "Media", services: [plex] },
  { key: "empty", categoryId: "empty", name: "Empty", services: [] },
  { key: "uncategorized", categoryId: null, name: "Uncategorized", services: [loose] },
];

const categories: Category[] = [
  { id: "media", name: "Media", position: 0, created_at: 1, updated_at: 1 },
  { id: "empty", name: "Empty", position: 1, created_at: 1, updated_at: 1 },
];

let queryWrapper = createQueryWrapper();

function Harness(props: Partial<EditableBoardProps>) {
  const [renamingKey, setRenamingKey] = useState<string | null>(props.renamingKey ?? null);
  const Wrapper = queryWrapper.wrapper;
  return (
    <Wrapper>
      <Toaster />
      <Board {...props} renamingKey={renamingKey} onRenamingKeyChange={setRenamingKey} />
    </Wrapper>
  );
}

function Board(props: Partial<EditableBoardProps>) {
  return (
    <EditableBoard
      categories={categories}
      density="comfortable"
      groups={groups}
      linkTarget="internal"
      mode="rows"
      onAddService={vi.fn()}
      onDeleteCategory={vi.fn()}
      onDeleteService={vi.fn()}
      onDuplicateService={vi.fn()}
      onEditService={vi.fn()}
      onMoveService={vi.fn()}
      onRenameCategory={vi.fn()}
      onReorderCategories={vi.fn()}
      renamingKey={null}
      onRenamingKeyChange={vi.fn()}
      {...props}
    />
  );
}

beforeEach(() => {
  queryWrapper = createQueryWrapper();
  queryWrapper.client.setQueryData(queryKeys.services, [plex, loose]);
});

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

  it("lists a card's links in its menu, since the card itself opens the editor", async () => {
    const user = userEvent.setup();
    const linked: Service = {
      ...plex,
      url: "http://plex.lan:32400/",
      external_url: "https://plex.example.com/",
      links: [{ label: "Logs", url: "https://logs.example.com/" }],
    };
    render(
      <Harness
        groups={[{ key: "media", categoryId: "media", name: "Media", services: [linked] }]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Actions for Plex" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /^Open/ }).getAttribute("href")).toBe(
      "http://plex.lan:32400/"
    );
    expect(
      within(menu).getByRole("menuitem", { name: /^External URL/ }).getAttribute("href")
    ).toBe("https://plex.example.com/");
    expect(within(menu).getByRole("menuitem", { name: /^Logs/ }).getAttribute("href")).toBe(
      "https://logs.example.com/"
    );
  });
});

describe("EditableBoard selection", () => {
  it("selects cards, a run with shift, or a whole category, and shows the bulk bar", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByRole("toolbar", { name: "Selected services" })).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: "Select Plex" }));
    const bar = screen.getByRole("toolbar", { name: "Selected services" });
    expect(within(bar).getByText("1 selected")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Select all in Media" }).getAttribute("aria-checked")).toBe(
      "true"
    );

    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("checkbox", { name: "Select Loose" }));
    await user.keyboard("{/Shift}");
    expect(within(bar).getByText("2 selected")).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: "Select all in Uncategorized" }));
    expect(within(bar).getByText("1 selected")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Select Loose" }).getAttribute("aria-checked")).toBe(
      "false"
    );

    await user.click(within(bar).getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("toggles a card with ctrl-click instead of opening it, and clears on Escape", async () => {
    const user = userEvent.setup();
    const onEditService = vi.fn();
    render(<Harness onEditService={onEditService} />);

    await user.keyboard("{Control>}");
    await user.click(screen.getByRole("button", { name: /^Plex\. Press Enter/ }));
    await user.keyboard("{/Control}");
    expect(onEditService).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Select Plex" }).getAttribute("aria-checked")).toBe(
      "true"
    );

    screen.getByRole("checkbox", { name: "Select Plex" }).focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("moves the selection in one request and clears it", async () => {
    const user = userEvent.setup();
    const moved = { ...loose, category: "Media", category_id: "media", position: 1 };
    vi.mocked(bulkApi.bulkMoveServices).mockResolvedValue([plex, moved]);
    render(<Harness />);

    await user.click(screen.getByRole("checkbox", { name: "Select Loose" }));
    await user.click(screen.getByRole("button", { name: "Move" }));
    await user.click(await screen.findByRole("menuitem", { name: "Media" }));

    expect(bulkApi.bulkMoveServices).toHaveBeenCalledWith(["loose"], "media");
    await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());
    expect(queryWrapper.client.getQueryData(queryKeys.services)).toEqual([plex, moved]);
    expect(await screen.findByText("Moved 1 service to Media")).toBeTruthy();
  });

  it("changes status checks for the selection and keeps it selected", async () => {
    const user = userEvent.setup();
    vi.mocked(bulkApi.bulkUpdateServiceChecks).mockResolvedValue([plex, loose]);
    render(<Harness />);

    await user.click(screen.getByRole("checkbox", { name: "Select all in Media" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Loose" }));
    await user.click(screen.getByRole("button", { name: "Status checks" }));
    await user.click(await screen.findByRole("menuitem", { name: "5 min" }));

    expect(bulkApi.bulkUpdateServiceChecks).toHaveBeenCalledWith({
      ids: ["plex", "loose"],
      check_interval: 300,
    });
    expect(await screen.findByText("Checking 2 services every 5 min")).toBeTruthy();
    expect(screen.getByRole("toolbar", { name: "Selected services" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Status checks" }));
    await user.click(await screen.findByRole("menuitem", { name: "Turn off" }));
    expect(bulkApi.bulkUpdateServiceChecks).toHaveBeenLastCalledWith({
      ids: ["plex", "loose"],
      check_enabled: false,
    });
  });

  it("deletes the selection with one undo for all of it", async () => {
    const user = userEvent.setup();
    vi.mocked(bulkApi.bulkDeleteServices).mockResolvedValue({
      success: true,
      deleted: 2,
      restorableUntil: 1,
    });
    vi.mocked(bulkApi.bulkRestoreServices).mockResolvedValue([plex, loose]);
    render(<Harness />);

    await user.click(screen.getByRole("checkbox", { name: "Select Plex" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Loose" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(bulkApi.bulkDeleteServices).toHaveBeenCalledWith(["plex", "loose"]);
    expect(queryWrapper.client.getQueryData(queryKeys.services)).toEqual([]);
    await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());

    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(bulkApi.bulkRestoreServices).toHaveBeenCalledWith(["plex", "loose"]);
    expect(await screen.findByText("Restored 2 services")).toBeTruthy();
    // Sorted the way the board reads them: by position, then name.
    expect(queryWrapper.client.getQueryData(queryKeys.services)).toEqual([loose, plex]);
  });

  it("puts the services back and keeps the selection when a bulk delete fails", async () => {
    const user = userEvent.setup();
    vi.mocked(bulkApi.bulkDeleteServices).mockRejectedValue(new Error("database is locked"));
    render(<Harness />);

    await user.click(screen.getByRole("checkbox", { name: "Select Plex" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Couldn't delete the services")).toBeTruthy();
    expect(queryWrapper.client.getQueryData(queryKeys.services)).toEqual([plex, loose]);
    expect(screen.getByRole("toolbar", { name: "Selected services" })).toBeTruthy();
  });
});
