// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiscoveryBanner } from "@/components/discovery/DiscoveryBanner";
import { createQueryWrapper } from "@/test/query";
import type { DiscoveryResponse } from "@shared/types";

const api = vi.hoisted(() => ({
  fetchDiscovery: vi.fn(),
  dismissSuggestion: vi.fn(),
  restoreDismissed: vi.fn(),
}));
vi.mock("@/lib/api/discovery", () => api);
vi.mock("@/lib/api/docker", () => ({ subscribeContainers: () => () => {} }));

const response: DiscoveryResponse = {
  suggestions: [
    {
      key: "media-jellyfin-1",
      name: "Jellyfin",
      url: null,
      port: 8096,
      iconUrl: "https://cdn/jellyfin.svg",
      category: null,
      description: null,
      source: "port",
    },
    {
      key: "web",
      name: "Front door",
      url: "http://door.lan/",
      port: null,
      iconUrl: null,
      category: "Infra",
      description: "Reverse proxy",
      source: "labels",
    },
  ],
  dismissed: 1,
};

beforeEach(() => {
  api.fetchDiscovery.mockResolvedValue(response);
  api.dismissSuggestion.mockResolvedValue(undefined);
  api.restoreDismissed.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderBanner(onCreate = vi.fn().mockResolvedValue(undefined)) {
  render(<DiscoveryBanner categories={["Media", "Infra"]} onCreate={onCreate} />, {
    wrapper: createQueryWrapper().wrapper,
  });
  return { onCreate, user: userEvent.setup() };
}

describe("DiscoveryBanner", () => {
  it("says how many running containers aren't on the dashboard", async () => {
    renderBanner();
    expect(
      await screen.findByText("2 running containers aren't on the dashboard yet")
    ).toBeTruthy();

    cleanup();
    api.fetchDiscovery.mockResolvedValue({ ...response, suggestions: [response.suggestions[1]] });
    renderBanner();
    expect(
      await screen.findByText("Front door is running but isn't on the dashboard yet")
    ).toBeTruthy();
  });

  it("stays hidden when there's nothing to suggest", async () => {
    api.fetchDiscovery.mockResolvedValue({ suggestions: [], dismissed: 0 });
    renderBanner();
    await waitFor(() => expect(api.fetchDiscovery).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Review" })).toBeNull();
  });

  it("adds a container as a service with the name and category picked", async () => {
    const { onCreate, user } = renderBanner();
    await user.click(await screen.findByRole("button", { name: "Review" }));
    const dialog = screen.getByRole("dialog", { name: "Running containers" });
    expect(within(dialog).getByText(`http://${window.location.hostname}:8096/`)).toBeTruthy();

    const name = within(dialog).getByRole("textbox", { name: "Name for media-jellyfin-1" });
    await user.clear(name);
    await user.type(name, "Movies");
    await user.type(
      within(dialog).getByRole("combobox", { name: "Category for media-jellyfin-1" }),
      "Media"
    );
    await user.click(within(dialog).getByRole("button", { name: "Add Movies" }));
    expect(onCreate).toHaveBeenCalledWith({
      name: "Movies",
      url: `http://${window.location.hostname}:8096/`,
      description: null,
      icon_url: "https://cdn/jellyfin.svg",
      category: "Media",
      open_in_new_tab: true,
    });

    await user.click(within(dialog).getByRole("button", { name: "Add Front door" }));
    expect(onCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: "http://door.lan/",
        category: "Infra",
        description: "Reverse proxy",
      })
    );
  });

  it("dismisses suggestions, brings dismissed ones back and shows errors", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("service url must be a valid URL"));
    const { user } = renderBanner(onCreate);
    await user.click(await screen.findByRole("button", { name: "Review" }));
    const dialog = screen.getByRole("dialog", { name: "Running containers" });

    await user.click(within(dialog).getByRole("button", { name: "Dismiss web" }));
    await waitFor(() => expect(api.dismissSuggestion).toHaveBeenCalled());
    expect(api.dismissSuggestion.mock.calls[0][0]).toBe("web");

    await user.click(
      within(dialog).getByRole("button", { name: "Show 1 dismissed container again" })
    );
    await waitFor(() => expect(api.restoreDismissed).toHaveBeenCalled());

    await user.click(within(dialog).getByRole("button", { name: "Add Jellyfin" }));
    expect(await within(dialog).findByText("service url must be a valid URL")).toBeTruthy();
  });
});
