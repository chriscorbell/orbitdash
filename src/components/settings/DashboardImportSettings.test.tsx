// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardImportSettings } from "@/components/settings/DashboardImportSettings";
import { createQueryWrapper } from "@/test/query";
import type { ImportPreview } from "@shared/types";

const apiMocks = vi.hoisted(() => ({
  applyImport: vi.fn(),
  previewImport: vi.fn(),
}));

vi.mock("@/lib/api/imports", () => apiMocks);
vi.mock("@/lib/api/categories", () => ({
  fetchCategories: vi
    .fn()
    .mockResolvedValue([
      { id: "c1", name: "Streaming", position: 0, created_at: 1, updated_at: 1 },
    ]),
}));

const svc = (name: string, duplicate = false) => ({
  name,
  url: `https://${name.toLowerCase()}.lan`,
  description: null,
  iconUrl: null,
  duplicate,
});

const preview: ImportPreview = {
  format: "homepage",
  groups: [
    { name: "Media", services: [svc("Jellyfin"), svc("Plex", true)] },
    { name: "Infra", services: [svc("Router")] },
  ],
  warnings: ['Router: icon font "mdi-router" can\'t be imported; pick an icon later.'],
};

function homepageFile(contents = "- Media: []") {
  return new File([contents], "services.yaml", { type: "application/json" });
}

function checkedState(dialog: HTMLElement, name: string | RegExp) {
  return within(dialog).getByRole("checkbox", { name }).getAttribute("aria-checked");
}

async function openPreview() {
  const user = userEvent.setup();
  const { client, wrapper } = createQueryWrapper();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(<DashboardImportSettings />, { wrapper });
  await user.upload(screen.getByLabelText("Dashboard file to import"), homepageFile());
  const dialog = await screen.findByRole("dialog", { name: "Import from Homepage" });
  return { dialog, invalidate, user };
}

beforeEach(() => {
  apiMocks.previewImport.mockResolvedValue(preview);
  apiMocks.applyImport.mockResolvedValue({
    created: 2,
    failed: [],
    iconFailures: 0,
    snapshot: "2026-10-10T00-00-00-000Z-pre-import",
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DashboardImportSettings", () => {
  it("previews a file with existing links unticked", async () => {
    const { dialog } = await openPreview();

    expect(apiMocks.previewImport).toHaveBeenCalledWith("- Media: []");
    expect(within(dialog).getByText(/3 services in 2 groups/)).toBeTruthy();
    expect(
      within(dialog).getByText(/1 link already on your dashboard starts unticked/)
    ).toBeTruthy();
    expect(within(dialog).getByText("1 note about this file")).toBeTruthy();
    expect(checkedState(dialog, /Jellyfin/)).toBe("true");
    expect(checkedState(dialog, /Plex/)).toBe("false");
    expect(within(dialog).getByText("Already added")).toBeTruthy();
    expect(checkedState(dialog, "Import all of Media")).toBe("mixed");
    expect(within(dialog).getByText("2 of 3 picked")).toBeTruthy();
  });

  it("imports the picked services into the chosen categories", async () => {
    const { dialog, invalidate, user } = await openPreview();

    await user.click(within(dialog).getByRole("checkbox", { name: "Import all of Infra" }));
    const category = within(dialog).getByRole("combobox", { name: "Category for Media" });
    await user.clear(category);
    await user.type(category, "Streaming");
    await user.click(within(dialog).getByRole("button", { name: "Import 1 service" }));

    expect(apiMocks.applyImport).toHaveBeenCalledWith([
      {
        name: "Jellyfin",
        url: "https://jellyfin.lan",
        description: null,
        iconUrl: null,
        category: "Streaming",
      },
    ]);
    expect(await within(dialog).findByText("Added 2 services")).toBeTruthy();
    expect(within(dialog).getByText("A snapshot of your dashboard was saved first.")).toBeTruthy();
    expect(within(dialog).queryByText(/couldn't/)).toBeNull();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["services"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["categories"] });

    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("reports services and icons that didn't come across", async () => {
    apiMocks.applyImport.mockResolvedValue({
      created: 0,
      failed: [{ name: "Jellyfin", error: "service url must be a valid URL" }],
      iconFailures: 1,
      snapshot: null,
    });
    const { dialog, user } = await openPreview();
    await user.click(within(dialog).getByRole("button", { name: "Import 2 services" }));

    expect(await within(dialog).findByText("Nothing was added")).toBeTruthy();
    expect(within(dialog).getByText(/1 icon couldn't be downloaded/)).toBeTruthy();
    expect(within(dialog).getByText("Jellyfin: service url must be a valid URL")).toBeTruthy();
  });

  it("keeps the preview open when the import fails", async () => {
    apiMocks.applyImport.mockRejectedValue(new Error("Server unavailable"));
    const { dialog, user } = await openPreview();
    await user.click(within(dialog).getByRole("button", { name: "Import 2 services" }));

    expect((await within(dialog).findAllByRole("alert"))[0].textContent).toBe("Server unavailable");
    expect(within(dialog).getByRole("button", { name: "Import 2 services" })).toBeTruthy();
  });

  it("explains files it can't read or that have nothing to import", async () => {
    const user = userEvent.setup();
    const { wrapper } = createQueryWrapper();
    render(<DashboardImportSettings />, { wrapper });
    const input = screen.getByLabelText("Dashboard file to import");

    apiMocks.previewImport.mockRejectedValueOnce(new Error("That file isn't valid YAML"));
    await user.upload(input, homepageFile());
    expect((await screen.findByRole("alert")).textContent).toBe("That file isn't valid YAML");

    apiMocks.previewImport.mockResolvedValueOnce({ ...preview, groups: [], warnings: [] });
    await user.upload(input, homepageFile());
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("That file has no services to import.")
    );

    await user.upload(input, homepageFile("x".repeat(5 * 1024 * 1024 + 1)));
    expect(screen.getByRole("alert").textContent).toBe("That file is too large to import.");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
