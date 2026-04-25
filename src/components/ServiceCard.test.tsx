// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  category: "Games",
  open_in_new_tab: true,
  created_at: 1,
  updated_at: 1,
};

describe("ServiceCard", () => {
  it("uses character-based truncation for descriptions", () => {
    render(<ServiceCard service={baseService} onEdit={vi.fn()} onDelete={vi.fn()} />);

    const description = screen.getByText(baseService.description as string);

    expect(description.className).toContain("truncate");
    expect(description.className).not.toContain("line-clamp-1");
  });
});
