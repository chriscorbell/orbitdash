// @vitest-environment happy-dom

import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { toHaveNoViolations } from "vitest-axe/dist/matchers.js";
import { ServiceDialog } from "@/components/ServiceDialog";
import * as iconLibraryApi from "@/lib/api/icon-library";
import { createQueryWrapper } from "@/test/query";
import type { Service } from "@shared/types";

vi.mock("@/lib/api/icon-library", () => ({
  searchIconLibrary: vi.fn(async (query: string) => ({
    entries: query.toLowerCase().startsWith("pl")
      ? [
          {
            id: "dashboard-icons:plex",
            source: "dashboard-icons",
            slug: "plex",
            name: "Plex",
            url: "https://cdn.example/plex.svg",
          },
          {
            id: "selfhst:plex",
            source: "selfhst",
            slug: "plex",
            name: "Plex",
            url: "https://cdn.example/selfhst-plex.svg",
          },
        ]
      : [],
    updatedAt: 1,
  })),
}));

/** The dialog with the query client its icon library needs. */
function render(ui: React.ReactElement) {
  return rtlRender(ui, { wrapper: createQueryWrapper().wrapper });
}

afterEach(() => {
  cleanup();
});

const baseService: Service = {
  id: "svc-1",
  name: "Orbit",
  url: "https://example.com/orbit",
  description: "Dashboard",
  icon: "orbit.svg",
  icon_source_url: null,
  category: "Monitoring",
  category_id: "cat-monitoring",
  position: 0,
  open_in_new_tab: true,
  created_at: 1,
  updated_at: 1,
  check_enabled: false,
  check_method: "http",
  check_target: null,
  check_interval: 60,
  check_ignore_tls: false,
};

describe("ServiceDialog", () => {
  it("submits a new service with normalized payload values", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <ServiceDialog
        open
        onOpenChange={onOpenChange}
        categoryOptions={["Infra"]}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: " Orbit " },
    });
    fireEvent.change(screen.getByLabelText("URL *"), {
      target: { value: " example.com/orbit " },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: " Dashboard " },
    });
    fireEvent.change(screen.getByLabelText("Icon URL"), {
      target: { value: " https://example.com/icon.svg " },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add service" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit).toHaveBeenCalledWith(
      {
        name: "Orbit",
        url: "https://example.com/orbit",
        description: "Dashboard",
        icon_url: "https://example.com/icon.svg",
        category: null,
        open_in_new_tab: true,
        check_enabled: false,
        check_method: "http",
        check_target: null,
        check_interval: 60,
        check_ignore_tls: false,
      },
      undefined,
      false
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("supports accessible dialog semantics and keyboard toggle behavior", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <ServiceDialog open onOpenChange={vi.fn()} categoryOptions={["Infra"]} onSubmit={onSubmit} />
    );

    expect(screen.getByRole("dialog", { name: "Add Service" })).toBeTruthy();

    const results = await axe(container);
    expect(toHaveNoViolations(results).pass).toBe(true);

    const switchControl = screen.getByRole("switch", { name: "Open in new tab" });
    expect(switchControl.getAttribute("aria-checked")).toBe("true");

    switchControl.focus();
    expect(document.activeElement).toBe(switchControl);

    await user.keyboard("[Space]");
    expect(switchControl.getAttribute("aria-checked")).toBe("false");

    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Orbit" },
    });
    fireEvent.change(screen.getByLabelText("URL *"), {
      target: { value: "https://example.com/orbit" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add service" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        open_in_new_tab: false,
      }),
      undefined,
      false
    );
  });

  it("shows schema validation errors and prevents invalid submission", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<ServiceDialog open onOpenChange={vi.fn()} categoryOptions={[]} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Orbit" },
    });
    fireEvent.change(screen.getByLabelText("URL *"), {
      target: { value: "not a url" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add service" }));

    await screen.findByText("service url must be a valid URL");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("suggests library icons for the name and uses one", async () => {
    render(<ServiceDialog open onOpenChange={vi.fn()} categoryOptions={[]} onSubmit={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Plex" } });
    const suggestion = await screen.findByRole("button", {
      name: "Use the Plex icon from dashboard-icons",
    });
    fireEvent.click(suggestion);

    expect((screen.getByLabelText("Icon URL") as HTMLInputElement).value).toBe(
      "https://cdn.example/plex.svg"
    );
    expect(screen.getByAltText("Icon preview").getAttribute("src")).toBe(
      "https://cdn.example/plex.svg"
    );
  });

  it("searches the icon library, credits both sources, and explains outages", async () => {
    const user = userEvent.setup();
    render(<ServiceDialog open onOpenChange={vi.fn()} categoryOptions={[]} onSubmit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Library" }));
    const search = screen.getByRole("searchbox", { name: "Search the icon library" });
    expect(screen.getByText("Type at least two letters.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "selfh.st/icons" })).toBeTruthy();

    await user.type(search, "pl");
    await user.click(
      await screen.findByRole("button", { name: "Use the Plex icon from selfh.st" })
    );
    expect((screen.getByLabelText("Icon URL") as HTMLInputElement).value).toBe(
      "https://cdn.example/selfhst-plex.svg"
    );
    expect(screen.queryByRole("searchbox", { name: "Search the icon library" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Library" }));
    await user.clear(screen.getByRole("searchbox", { name: "Search the icon library" }));
    await user.type(screen.getByRole("searchbox", { name: "Search the icon library" }), "zz");
    expect(await screen.findByText("No icons match that.")).toBeTruthy();

    vi.mocked(iconLibraryApi.searchIconLibrary).mockRejectedValueOnce(new Error("offline"));
    await user.type(screen.getByRole("searchbox", { name: "Search the icon library" }), "x");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "The icon library is unavailable right now"
    );
  });

  it("supports icon preview removal and delete flow in edit mode", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <ServiceDialog
        open
        onOpenChange={onOpenChange}
        service={baseService}
        categoryOptions={["Infra"]}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onDelete={onDelete}
      />
    );

    const newCategoryInput = screen.getByPlaceholderText("e.g. Infrastructure, Media");
    if (!(newCategoryInput instanceof HTMLInputElement)) {
      throw new Error("Expected new category input to be an HTMLInputElement");
    }
    expect(newCategoryInput.value).toBe("Monitoring");

    const previewImage = screen.getByAltText("Icon preview");
    if (!(previewImage instanceof HTMLImageElement)) {
      throw new Error("Expected preview image to be an HTMLImageElement");
    }
    expect(previewImage.getAttribute("src")).toContain("orbit.svg");

    fireEvent.click(screen.getByLabelText("Remove icon"));
    await waitFor(() => {
      expect(screen.queryByAltText("Icon preview")).toBeNull();
    });
  });

  it("deletes right away from the edit dialog and closes it", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <ServiceDialog
        open
        onOpenChange={onOpenChange}
        service={baseService}
        categoryOptions={["Infra"]}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("stays open and shows the error when deleting fails", async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error("Delete failed upstream"));
    const onOpenChange = vi.fn();

    render(
      <ServiceDialog
        open
        onOpenChange={onOpenChange}
        service={baseService}
        categoryOptions={["Infra"]}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await screen.findByText("Delete failed upstream");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("offers no delete action when adding a service", () => {
    render(<ServiceDialog open onOpenChange={vi.fn()} categoryOptions={[]} onSubmit={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add service" })).toBeTruthy();
  });

  it("accepts every icon format the server supports", () => {
    render(<ServiceDialog open onOpenChange={vi.fn()} categoryOptions={[]} onSubmit={vi.fn()} />);

    const accept = screen.getByLabelText("Upload icon file").getAttribute("accept") ?? "";
    for (const type of [
      "image/png",
      "image/svg+xml",
      "image/jpeg",
      "image/gif",
      "image/webp",
      ".ico",
    ]) {
      expect(accept.split(",")).toContain(type);
    }
    expect(screen.getByText("Icon")).toBeTruthy();
  });

  describe("status check", () => {
    function fillRequired(url = "https://jellyfin.example.com") {
      fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Jellyfin" } });
      fireEvent.change(screen.getByLabelText("URL *"), { target: { value: url } });
    }

    it("is off for a new service and opens its settings when switched on", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(
        <ServiceDialog open onOpenChange={vi.fn()} categoryOptions={[]} onSubmit={onSubmit} />
      );
      fillRequired("nas.lan:8096");

      const toggle = screen.getByRole("switch", { name: "Status check" });
      expect(toggle.getAttribute("aria-checked")).toBe("false");
      expect(screen.queryByLabelText("Check URL")).toBeNull();

      await user.click(toggle);
      // The placeholder shows what gets checked when the field is left empty.
      expect(screen.getByLabelText("Check URL").getAttribute("placeholder")).toBe(
        "http://nas.lan:8096/"
      );
      expect(screen.getByRole("combobox", { name: "Method" }).textContent).toContain("HTTP");
      expect(screen.getByRole("combobox", { name: "Every" }).textContent).toContain("1 min");

      await user.click(screen.getByRole("switch", { name: "Allow self-signed certificates" }));
      fireEvent.click(screen.getByRole("button", { name: "Add service" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0][0]).toMatchObject({
        check_enabled: true,
        check_method: "http",
        check_target: null,
        check_interval: 60,
        check_ignore_tls: true,
      });
    });

    it("edits a TCP check and validates its address before saving", async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(
        <ServiceDialog
          open
          onOpenChange={vi.fn()}
          service={{
            ...baseService,
            check_enabled: true,
            check_method: "tcp",
            check_target: "nas.lan:22",
            check_interval: 120,
          }}
          categoryOptions={["Monitoring"]}
          onSubmit={onSubmit}
        />
      );

      const address = screen.getByLabelText("Host and port");
      expect((address as HTMLInputElement).value).toBe("nas.lan:22");
      expect(address.getAttribute("placeholder")).toBe("example.com:443");
      expect(screen.getByRole("combobox", { name: "Every" }).textContent).toContain("2 min");
      expect(screen.queryByRole("switch", { name: "Allow self-signed certificates" })).toBeNull();

      fireEvent.change(address, { target: { value: "nas.lan" } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await screen.findByText("check address must be a host and port, like nas.lan:22");
      expect(onSubmit).not.toHaveBeenCalled();

      fireEvent.change(address, { target: { value: " NAS.lan:2222 " } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0][0]).toMatchObject({
        check_method: "tcp",
        check_target: "nas.lan:2222",
        check_interval: 120,
      });
    });

    it("suggests example targets until the link URL is usable", async () => {
      const user = userEvent.setup();
      render(<ServiceDialog open onOpenChange={vi.fn()} categoryOptions={[]} onSubmit={vi.fn()} />);
      await user.click(screen.getByRole("switch", { name: "Status check" }));
      expect(screen.getByLabelText("Check URL").getAttribute("placeholder")).toBe(
        "https://example.com/health"
      );
    });
  });

  it("shows where a downloaded icon came from until the icon is changed", () => {
    render(
      <ServiceDialog
        open
        onOpenChange={vi.fn()}
        service={{ ...baseService, icon_source_url: "https://cdn.example.com/orbit.svg" }}
        categoryOptions={["Infra"]}
        onSubmit={vi.fn()}
      />
    );

    const sourceLink = screen.getByRole("link", { name: "https://cdn.example.com/orbit.svg" });
    expect(sourceLink.getAttribute("href")).toBe("https://cdn.example.com/orbit.svg");
    expect(screen.getByText(/Downloaded from/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Icon URL"), {
      target: { value: "https://example.com/new.svg" },
    });
    expect(screen.queryByText(/Downloaded from/)).toBeNull();

    fireEvent.change(screen.getByLabelText("Icon URL"), { target: { value: "" } });
    expect(screen.getByText(/Downloaded from/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Remove icon"));
    expect(screen.queryByText(/Downloaded from/)).toBeNull();
  });
});
