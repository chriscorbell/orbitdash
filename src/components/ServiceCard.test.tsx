// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ServiceCard } from "@/components/ServiceCard";
import type { Service } from "@shared/types";

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
