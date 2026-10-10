// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette, type PaletteContext } from "@/components/palette/CommandPalette";
import { DEFAULT_DASHBOARD_SETTINGS } from "@shared/dashboard-settings";
import type { Service } from "@shared/types";

function service(name: string, extra: Partial<Service> = {}): Service {
  return {
    id: name.toLowerCase(),
    name,
    url: `https://${name.toLowerCase()}.example.com/`,
    description: null,
    icon: null,
    icon_source_url: null,
    category: "Media",
    category_id: "media",
    position: 0,
    open_in_new_tab: false,
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
    ...extra,
  };
}

const services = [
  service("Jellyfin", { external_url: "https://jellyfin.example.org/", tags: ["video"] }),
  service("Plex", { open_in_new_tab: true }),
];
let openSpy: ReturnType<typeof vi.fn>;
let assignSpy: ReturnType<typeof vi.fn<(url: string | URL) => void>>;

beforeEach(() => {
  openSpy = vi.fn();
  assignSpy = vi.fn<(url: string | URL) => void>();
  vi.stubGlobal("open", openSpy);
  vi.spyOn(window.location, "assign").mockImplementation(assignSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPalette(
  initialQuery = "",
  search = DEFAULT_DASHBOARD_SETTINGS.search,
  linkTarget: "internal" | "external" = "internal"
) {
  const onOpenChange = vi.fn();
  const runSettings = vi.fn();
  const context: PaletteContext = {
    canEdit: true,
    page: "services",
    showServices: false,
    showStatsPage: false,
    theme: "dark",
    onAddService: vi.fn(),
    onEditLayout: vi.fn(),
    onNavigate: vi.fn(),
    onOpenSettings: runSettings,
    onThemeChange: vi.fn(),
  };
  render(
    <CommandPalette
      open
      initialQuery={initialQuery}
      linkTarget={linkTarget}
      services={services}
      context={context}
      search={search}
      onOpenChange={onOpenChange}
    />
  );
  return { onOpenChange, runSettings, input: screen.getByRole("combobox") };
}

describe("CommandPalette", () => {
  it("starts with what was typed, focused, and lists matches as options", () => {
    const { input } = renderPalette("jel");
    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe("jel");
    const options = screen.getAllByRole("option");
    expect(options[0].textContent).toContain("Jellyfin");
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
    expect(screen.getByText("Services")).toBeTruthy();
    expect(screen.getByText("Web")).toBeTruthy();
  });

  it("opens the top hit with Enter in this tab, as the service is set up", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderPalette("jelly");
    await user.keyboard("{Enter}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(assignSpy).toHaveBeenCalledWith("https://jellyfin.example.com/");
  });

  it("opens the URL the cards open, and shows the matching tag", async () => {
    const user = userEvent.setup();
    renderPalette("video", DEFAULT_DASHBOARD_SETTINGS.search, "external");
    const option = screen.getAllByRole("option")[0];
    expect(option.textContent).toContain("#video");
    expect(option.textContent).toContain("jellyfin.example.org");
    await user.keyboard("{Enter}");
    expect(assignSpy).toHaveBeenCalledWith("https://jellyfin.example.org/");
  });

  it("opens in a new tab for services set that way, or with Ctrl+Enter", async () => {
    const user = userEvent.setup();
    renderPalette("plex");
    await user.keyboard("{Enter}");
    expect(openSpy).toHaveBeenCalledWith(
      "https://plex.example.com/",
      "_blank",
      "noopener,noreferrer"
    );

    cleanup();
    renderPalette("jelly");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(openSpy).toHaveBeenLastCalledWith(
      "https://jellyfin.example.com/",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("moves with the arrow keys, Home and End, and searches the web as a last resort", async () => {
    const user = userEvent.setup();
    renderPalette("media", { engine: "custom", customUrl: "https://searx.lan/search?q=%s" });
    const options = () => screen.getAllByRole("option");
    expect(options()).toHaveLength(3);

    await user.keyboard("{ArrowDown}");
    expect(options()[1].getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(options()[2].getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{Home}");
    expect(options()[0].getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{End}");
    expect(options()[2].textContent).toContain("Search the web for “media”");
    await user.keyboard("{Enter}");
    expect(openSpy).toHaveBeenCalledWith(
      "https://searx.lan/search?q=media",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("lists actions when empty and runs one by click", async () => {
    const user = userEvent.setup();
    const { runSettings, onOpenChange, input } = renderPalette();
    expect(screen.getByText("Actions")).toBeTruthy();
    await user.click(screen.getByRole("option", { name: /Open settings/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(runSettings).toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "zzzz" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByText(/Search DuckDuckGo for/)).toBeTruthy();
  });

  it("follows the pointer to choose the active option", () => {
    renderPalette("media");
    const options = screen.getAllByRole("option");
    fireEvent.pointerMove(options[1]);
    expect(options[1].getAttribute("aria-selected")).toBe("true");
  });
});
