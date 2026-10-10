// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceCard } from "@/components/ServiceCard";
import * as statusApi from "@/lib/api/status";
import { createQueryWrapper } from "@/test/query";
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
};

describe("ServiceCard", () => {
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
