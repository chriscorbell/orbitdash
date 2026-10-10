// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceCard } from "@/components/ServiceCard";
import * as statusApi from "@/lib/api/status";
import { createQueryWrapper } from "@/test/query";
import { setIntegrationReadings } from "@/lib/integration-readings";
import type { Service } from "@shared/types";

vi.mock("@/lib/api/status", () => ({
  fetchStatuses: vi.fn(async () =>
    ["a", "b", "c"].map((id) => ({
      id,
      state: "up",
      latencyMs: 12,
      statusCode: 200,
      error: null,
      checkedAt: 1,
      changedAt: 1,
    }))
  ),
  fetchStatusHistory: vi.fn(),
}));

const fetchStatuses = vi.mocked(statusApi.fetchStatuses);

afterEach(() => {
  cleanup();
});

const baseService: Service = {
  id: "svc-1",
  name: "Crafty",
  url: "https://example.com/crafty",
  description: "Minecraft server console and status page",
  icon: null,
  icon_source_url: null,
  category: "Games",
  category_id: "cat-games",
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

describe("ServiceCard", () => {
  it("shows integration figures on comfortable cards once they arrive", async () => {
    setIntegrationReadings({
      "svc-1": {
        type: "sonarr",
        stats: [{ label: "Queue", value: "3", tone: "good" }],
        error: null,
        updatedAt: 1,
      },
    });
    render(<ServiceCard service={baseService} />);
    expect(await screen.findByText("Queue")).toBeTruthy();
    cleanup();
    render(<ServiceCard service={baseService} density="compact" />);
    expect(screen.queryByText("Queue")).toBeNull();
    setIntegrationReadings({});
  });

  it("uses character-based truncation for descriptions", () => {
    render(<ServiceCard service={baseService} />);

    const description = screen.getByText(baseService.description as string);

    expect(description.className).toContain("truncate");
    expect(description.className).not.toContain("line-clamp-1");
  });

  it("shows the name under a large icon in the tile density", () => {
    render(<ServiceCard service={baseService} density="tiles" />);

    expect(screen.getByText("Crafty")).toBeTruthy();
    expect(screen.queryByText(baseService.description as string)).toBeNull();
    expect(screen.getByRole("link").getAttribute("title")).toBe(
      `Crafty\n${baseService.description}`
    );
  });

  it("is a plain link to the service with no menu", () => {
    render(<ServiceCard service={{ ...baseService, open_in_new_tab: false }} />);

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("https://example.com/crafty");
    expect(link.getAttribute("target")).toBe("_self");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows no status dot while checks are off", () => {
    render(<ServiceCard service={baseService} density="compact" />);

    expect(document.querySelector("[data-status]")).toBeNull();
    expect(screen.getByRole("link").getAttribute("title")).toBe(baseService.description);
    expect(fetchStatuses).not.toHaveBeenCalled();
  });

  it("loads a live status dot for a card with checks on, in every density", async () => {
    const { wrapper: Wrapper } = createQueryWrapper();
    const checked = { ...baseService, check_enabled: true };
    render(
      <Wrapper>
        <ServiceCard service={{ ...checked, id: "a" }} density="compact" />
        <ServiceCard service={{ ...checked, id: "b" }} density="comfortable" />
        <ServiceCard service={{ ...checked, id: "c" }} density="tiles" />
      </Wrapper>
    );

    await waitFor(() => expect(document.querySelectorAll('[data-status="up"]')).toHaveLength(3));
    expect(screen.getAllByText("12 ms")).toHaveLength(1);
    // The status details repeat the hint, so the native title goes.
    await waitFor(() =>
      expect(screen.getAllByRole("link").every((link) => !link.hasAttribute("title"))).toBe(true)
    );
  });

  it("opens the external URL when the dashboard is reached from outside", () => {
    const service = { ...baseService, external_url: "https://crafty.example.org/" };
    render(
      <>
        <ServiceCard service={service} linkTarget="external" />
        <ServiceCard service={{ ...service, id: "b", name: "Inside" }} linkTarget="internal" />
        <ServiceCard service={{ ...baseService, id: "c", name: "Only" }} linkTarget="external" />
      </>
    );

    expect(screen.getByRole("link", { name: /^Crafty/ }).getAttribute("href")).toBe(
      "https://crafty.example.org/"
    );
    expect(screen.getByRole("link", { name: /^Inside/ }).getAttribute("href")).toBe(
      "https://example.com/crafty"
    );
    // Without an external URL there is only the one link to open.
    expect(screen.getByRole("link", { name: /^Only/ }).getAttribute("href")).toBe(
      "https://example.com/crafty"
    );
  });

  it("offers named links and the other URL in a menu beside the card", async () => {
    const user = userEvent.setup();
    render(
      <ServiceCard
        service={{
          ...baseService,
          external_url: "https://crafty.example.org/",
          links: [{ label: "Console", url: "https://example.com/crafty/console" }],
        }}
        linkTarget="internal"
      />
    );

    // The link stays a plain link; the menu button sits beside it, not inside it.
    const link = screen.getByRole("link", { name: /^Crafty/ });
    const trigger = await screen.findByRole("button", { name: "More links for Crafty" });
    expect(link.contains(trigger)).toBe(false);

    await user.click(trigger);
    const menu = await screen.findByRole("menu");
    const external = within(menu).getByRole("menuitem", { name: /^External URL/ });
    expect(external.getAttribute("href")).toBe("https://crafty.example.org/");
    expect(external.getAttribute("target")).toBe("_blank");
    expect(
      within(menu)
        .getByRole("menuitem", { name: /^Console/ })
        .getAttribute("href")
    ).toBe("https://example.com/crafty/console");
    expect(within(menu).queryByRole("menuitem", { name: /^Open/ })).toBeNull();
  });

  it("names the main URL as internal in the menu when the card opens the external one", async () => {
    const user = userEvent.setup();
    render(
      <ServiceCard
        service={{ ...baseService, external_url: "https://crafty.example.org/" }}
        density="tiles"
        linkTarget="external"
      />
    );

    await user.click(await screen.findByRole("button", { name: "More links for Crafty" }));
    expect(
      (await screen.findByRole("menuitem", { name: /^Internal URL/ })).getAttribute("href")
    ).toBe("https://example.com/crafty");
  });

  it("does not navigate when the URL is unsafe", () => {
    render(<ServiceCard service={{ ...baseService, url: "javascript:alert(1)" }} />);

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("#");
    expect(link.getAttribute("aria-disabled")).toBe("true");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });
});
