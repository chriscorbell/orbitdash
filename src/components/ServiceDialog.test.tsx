// @vitest-environment happy-dom

import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const toolsApi = vi.hoisted(() => ({
  inspectServiceUrl: vi.fn(),
  testService: vi.fn(),
}));

vi.mock("@/lib/api/service-tools", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/service-tools")>()),
  ...toolsApi,
}));

const integrationsApi = vi.hoisted(() => ({
  fetchIntegrationTypes: vi.fn(),
  fetchServiceIntegration: vi.fn(),
  saveServiceIntegration: vi.fn(),
  deleteServiceIntegration: vi.fn(),
  testIntegration: vi.fn(),
}));

vi.mock("@/lib/api/integrations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/integrations")>()),
  ...integrationsApi,
}));

const ADGUARD = {
  id: "adguard",
  name: "AdGuard Home",
  icon: "adguard-home",
  fields: [
    { key: "url", label: "API address", kind: "url", required: false, help: "Only if different." },
    { key: "username", label: "Username", kind: "text", required: true },
    { key: "password", label: "Password", kind: "secret", required: true },
    { key: "ignoreTls", label: "Allow self-signed certificates", kind: "toggle", required: false },
  ],
} as const;

beforeEach(() => {
  for (const mock of Object.values(integrationsApi)) mock.mockReset();
  integrationsApi.fetchIntegrationTypes.mockResolvedValue([ADGUARD]);
  integrationsApi.fetchServiceIntegration.mockResolvedValue(null);
  integrationsApi.saveServiceIntegration.mockResolvedValue(null);
  integrationsApi.deleteServiceIntegration.mockResolvedValue(undefined);
});

/** The dialog with the query client its icon library needs. */
function render(ui: React.ReactElement) {
  return rtlRender(ui, { wrapper: createQueryWrapper().wrapper });
}

afterEach(() => {
  cleanup();
  toolsApi.inspectServiceUrl.mockReset();
  toolsApi.testService.mockReset();
});

function renderAdd() {
  render(
    <ServiceDialog
      open
      onOpenChange={vi.fn()}
      categoryOptions={[]}
      onSubmit={vi.fn().mockResolvedValue(undefined)}
    />
  );
  return {
    user: userEvent.setup(),
    name: screen.getByLabelText(/^Name/) as HTMLInputElement,
    url: screen.getByLabelText(/^URL/) as HTMLInputElement,
  };
}

describe("ServiceDialog link helpers", () => {
  const inspection = {
    url: "http://10.0.0.20:32400/",
    reachable: true,
    error: null,
    name: "Plex",
    iconUrl: "http://10.0.0.20:32400/favicon.png",
    selfSigned: false,
  };

  it("reads a pasted link to fill in the name and offer the site's icon", async () => {
    toolsApi.inspectServiceUrl.mockResolvedValue(inspection);
    const { user, name, url } = renderAdd();

    await user.click(url);
    await user.paste("10.0.0.20:32400");
    await waitFor(() => expect(toolsApi.inspectServiceUrl).toHaveBeenCalled());
    expect(toolsApi.inspectServiceUrl.mock.calls[0][0]).toBe("http://10.0.0.20:32400/");
    await waitFor(() => expect(name.value).toBe("Plex"));
    expect(screen.getByText("http://10.0.0.20:32400/")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Use the site's own icon" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Plex icon from dashboard-icons/ })).toBeTruthy();

    // Leaving the field with the same link doesn't read it again.
    await user.tab();
    expect(toolsApi.inspectServiceUrl).toHaveBeenCalledTimes(1);
  });

  it("keeps a name that was already typed and explains unreachable pages", async () => {
    toolsApi.inspectServiceUrl.mockResolvedValue({
      ...inspection,
      url: "http://nas.lan/",
      reachable: false,
      error: "Connection refused",
      name: null,
      iconUrl: null,
      selfSigned: true,
    });
    const { user, name, url } = renderAdd();

    await user.type(name, "My NAS");
    await user.type(url, "nas.lan");
    await user.tab();
    expect(await screen.findByText("Couldn't read the page: Connection refused")).toBeTruthy();
    expect(screen.getByText("Uses a self-signed certificate")).toBeTruthy();
    expect(name.value).toBe("My NAS");
  });

  it("tests the link before saving and clears the result when it changes", async () => {
    toolsApi.inspectServiceUrl.mockResolvedValue(inspection);
    toolsApi.testService.mockResolvedValue({
      target: "http://10.0.0.20:32400/",
      state: "up",
      latencyMs: 42,
      statusCode: 200,
      error: null,
    });
    const { user, url } = renderAdd();
    const testButton = screen.getByRole("button", { name: "Test" });
    expect(testButton).toHaveProperty("disabled", true);

    await user.type(url, "10.0.0.20:32400");
    await user.click(testButton);
    await waitFor(() => expect(toolsApi.testService).toHaveBeenCalled());
    expect(toolsApi.testService.mock.calls[0][0]).toEqual({
      url: "http://10.0.0.20:32400/",
      check_method: "http",
      check_target: null,
      check_ignore_tls: false,
    });
    expect(await screen.findByText("Up · 42 ms · HTTP 200")).toBeTruthy();

    await user.type(url, "/web");
    expect(screen.queryByText("Up · 42 ms · HTTP 200")).toBeNull();

    toolsApi.testService.mockResolvedValue({
      target: "http://10.0.0.20:32400/web",
      state: "down",
      latencyMs: null,
      statusCode: null,
      error: "Connection refused",
    });
    await user.click(testButton);
    expect(await screen.findByText("Down · Connection refused")).toBeTruthy();

    toolsApi.testService.mockRejectedValue(new Error("Couldn't run the test"));
    await user.click(testButton);
    expect(await screen.findByText("Couldn't run the test")).toBeTruthy();
  });
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
  external_url: null,
  links: [],
  tags: [],
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
        external_url: null,
        links: [],
        tags: [],
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

    toolsApi.inspectServiceUrl.mockResolvedValue({
      url: "http://dns.lan/",
      reachable: false,
      error: "Connection refused",
      name: null,
      iconUrl: null,
      selfSigned: false,
    });
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

describe("ServiceDialog external URL, tags and links", () => {
  const linked: Service = {
    ...baseService,
    external_url: "https://orbit.example.com/",
    links: [{ label: "Logs", url: "https://example.com/orbit/logs" }],
    tags: ["monitoring", "infra"],
  };

  function renderEdit(service: Service = linked, services: Service[] = []) {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ServiceDialog
        open
        onOpenChange={vi.fn()}
        service={service}
        categoryOptions={["Monitoring"]}
        services={services}
        onSubmit={onSubmit}
      />
    );
    return { onSubmit, user: userEvent.setup() };
  }

  const tagInput = () => screen.getByLabelText("Tags") as HTMLInputElement;
  const tagNames = () =>
    screen
      .queryAllByRole("button", { name: /^Remove tag / })
      .map((button) => button.getAttribute("aria-label")!.replace("Remove tag ", ""));

  it("shows what the service has and saves the changes", async () => {
    const { onSubmit, user } = renderEdit();

    expect((screen.getByLabelText("External URL") as HTMLInputElement).value).toBe(
      "https://orbit.example.com/"
    );
    expect(tagNames()).toEqual(["monitoring", "infra"]);
    expect((screen.getByLabelText("Label for link 1") as HTMLInputElement).value).toBe("Logs");

    await user.type(tagInput(), "Home Lab{Enter}");
    await user.type(tagInput(), "metrics,grafana,");
    await user.click(screen.getByRole("button", { name: "Remove tag infra" }));
    await user.click(tagInput());
    await user.keyboard("{Backspace}");
    expect(tagNames()).toEqual(["monitoring", "home lab", "metrics"]);
    expect(await screen.findByText("Removed grafana")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Add link" }));
    const label = screen.getByLabelText("Label for link 2");
    expect(document.activeElement).toBe(label);
    await user.type(label, "Admin");
    await user.type(screen.getByLabelText("URL for link 2"), "example.com/orbit/admin");
    await user.click(screen.getByRole("button", { name: "Remove Logs" }));

    fireEvent.change(screen.getByLabelText("External URL"), {
      target: { value: "orbit.example.org" },
    });
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      external_url: "https://orbit.example.org/",
      links: [{ label: "Admin", url: "https://example.com/orbit/admin" }],
      tags: ["monitoring", "home lab", "metrics"],
    });
  });

  it("keeps a tag that was typed but not added yet, and clears the external URL", async () => {
    const { onSubmit, user } = renderEdit();

    fireEvent.change(tagInput(), { target: { value: "Pending" } });
    fireEvent.change(screen.getByLabelText("External URL"), { target: { value: " " } });
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      external_url: null,
      tags: ["monitoring", "infra", "pending"],
    });
  });

  it("suggests tags other services use and adds a picked one at once", () => {
    renderEdit({ ...linked, tags: [] }, [
      { ...baseService, id: "a", tags: ["media", "infra"] },
      { ...baseService, id: "b", tags: ["infra"] },
    ]);

    const list = document.getElementById(tagInput().getAttribute("list")!)!;
    expect(Array.from(list.querySelectorAll("option"), (option) => option.value)).toEqual([
      "infra",
      "media",
    ]);

    // Picking from the list fills the whole value in one plain change event.
    fireEvent.change(tagInput(), { target: { value: "media" } });
    expect(tagNames()).toEqual(["media"]);
    expect(tagInput().value).toBe("");
  });

  it("stops taking tags at the limit", () => {
    const tags = Array.from({ length: 10 }, (_, index) => `tag ${index}`);
    renderEdit({ ...linked, tags });

    expect(tagInput().disabled).toBe(true);
    expect(tagInput().placeholder).toBe("Up to 10 tags");
  });

  it("stops offering new links at five", () => {
    const links = Array.from({ length: 5 }, (_, index) => ({
      label: `Link ${index}`,
      url: `https://example.com/${index}`,
    }));
    renderEdit({ ...linked, links });

    expect(screen.queryByRole("button", { name: "Add link" })).toBeNull();
  });

  it("explains a link or external URL that can't be saved", async () => {
    const { onSubmit, user } = renderEdit();

    fireEvent.change(screen.getByLabelText("External URL"), { target: { value: "ftp://x" } });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("external url must be a valid URL")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("External URL"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Label for link 1"), { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("each link needs a label")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("ServiceDialog integrations", () => {
  function renderEdit(onSubmit = vi.fn().mockResolvedValue(baseService)) {
    render(
      <ServiceDialog
        open
        onOpenChange={vi.fn()}
        service={baseService}
        categoryOptions={["Monitoring"]}
        onSubmit={onSubmit}
      />
    );
    return { onSubmit, user: userEvent.setup() };
  }

  async function pickAdGuard(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("combobox", { name: "Integration" }));
    await user.click(await screen.findByRole("option", { name: "AdGuard Home" }));
  }

  it("sets one up, tests it with the form's values and saves it with the service", async () => {
    integrationsApi.testIntegration.mockResolvedValue({
      type: "adguard",
      stats: [{ label: "Queries", value: "1,000" }],
      error: null,
      updatedAt: 1,
    });
    const { onSubmit, user } = renderEdit();
    await pickAdGuard(user);
    expect(screen.getByText("Only if different.")).toBeTruthy();
    expect(screen.getByLabelText("API address").getAttribute("placeholder")).toBe(
      "https://example.com/orbit"
    );
    await user.type(screen.getByLabelText("Username *"), "me");
    await user.type(screen.getByLabelText("Password"), "pw");
    await user.click(screen.getByRole("switch", { name: "Allow self-signed certificates" }));
    const testButtons = screen.getAllByRole("button", { name: "Test" });
    await user.click(testButtons[testButtons.length - 1]);
    expect(await screen.findByText("1,000")).toBeTruthy();
    expect(integrationsApi.testIntegration.mock.calls[0][0]).toEqual({
      serviceId: "svc-1",
      url: "https://example.com/orbit",
      type: "adguard",
      values: { username: "me", password: "pw", ignoreTls: true },
    });

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(integrationsApi.saveServiceIntegration).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalled();
    expect(integrationsApi.saveServiceIntegration).toHaveBeenCalledWith("svc-1", {
      type: "adguard",
      values: { username: "me", password: "pw", ignoreTls: true },
    });
  });

  it("keeps a saved secret and removes the integration when set to none", async () => {
    integrationsApi.fetchServiceIntegration.mockResolvedValue({
      type: "adguard",
      values: { username: "me" },
      secretsSet: ["password"],
    });
    const { user } = renderEdit();
    expect((await screen.findByLabelText("Password")).getAttribute("placeholder")).toBe(
      "Saved; type to replace"
    );
    await user.click(screen.getByRole("combobox", { name: "Integration" }));
    await user.click(await screen.findByRole("option", { name: "None" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(integrationsApi.deleteServiceIntegration).toHaveBeenCalledWith("svc-1")
    );
    expect(integrationsApi.saveServiceIntegration).not.toHaveBeenCalled();
  });

  it("doesn't save the service while a required field is empty", async () => {
    const { onSubmit, user } = renderEdit();
    await pickAdGuard(user);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Username is required for the integration")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("saves under a new service's id and reports a failed save without losing the service", async () => {
    const created = { ...baseService, id: "new-id" };
    const onSubmit = vi.fn().mockResolvedValue(created);
    integrationsApi.saveServiceIntegration.mockRejectedValue(new Error("Password is required"));
    toolsApi.inspectServiceUrl.mockResolvedValue({
      url: "http://dns.lan/",
      reachable: false,
      error: "Connection refused",
      name: null,
      iconUrl: null,
      selfSigned: false,
    });
    render(<ServiceDialog open onOpenChange={vi.fn()} categoryOptions={[]} onSubmit={onSubmit} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Name/), "DNS");
    await user.type(screen.getByLabelText(/^URL/), "dns.lan");
    await pickAdGuard(user);
    await user.type(screen.getByLabelText("Username *"), "me");
    await user.type(screen.getByLabelText("Password"), "pw");
    await user.click(screen.getByRole("button", { name: /Add service/ }));
    await waitFor(() => expect(integrationsApi.saveServiceIntegration).toHaveBeenCalled());
    expect(integrationsApi.saveServiceIntegration.mock.calls[0][0]).toBe("new-id");
  });
});
