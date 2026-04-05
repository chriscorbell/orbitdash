// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCategoryOrder } from "@/hooks/useCategoryOrder";
import * as settingsApi from "@/lib/api/settings";
import type { Service } from "@shared/types";

vi.mock("@/lib/api/settings", () => ({
  fetchCategoryOrder: vi.fn(),
  updateCategoryOrder: vi.fn(),
}));

const fetchCategoryOrderMock = vi.mocked(settingsApi.fetchCategoryOrder);
const updateCategoryOrderMock = vi.mocked(settingsApi.updateCategoryOrder);

const services: Service[] = [
  {
    id: "svc-1",
    name: "Orbit",
    url: "https://example.com/orbit",
    description: null,
    icon: null,
    category: "Media",
    open_in_new_tab: true,
    created_at: 1,
    updated_at: 1,
  },
  {
    id: "svc-2",
    name: "Grafana",
    url: "https://example.com/grafana",
    description: null,
    icon: null,
    category: "Infra",
    open_in_new_tab: true,
    created_at: 1,
    updated_at: 1,
  },
  {
    id: "svc-3",
    name: "Homepage",
    url: "https://example.com/homepage",
    description: null,
    icon: null,
    category: null,
    open_in_new_tab: true,
    created_at: 1,
    updated_at: 1,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useCategoryOrder", () => {
  it("loads category order and exposes visible categories", async () => {
    fetchCategoryOrderMock.mockResolvedValue({ order: ["Media"] });

    const { result } = renderHook(() => useCategoryOrder(services));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.namedCategories).toEqual(["Media", "Infra"]);
    expect(result.current.visibleCategoryOrder).toEqual([
      "Media",
      "Infra",
      "Uncategorized",
    ]);
  });

  it("supports reordering and saving category order", async () => {
    fetchCategoryOrderMock.mockResolvedValue({ order: ["Media", "Infra"] });
    updateCategoryOrderMock.mockResolvedValue({ order: ["Infra", "Media"] });

    const { result } = renderHook(() => useCategoryOrder(services));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.beginReorder();
      result.current.moveCategory("Media", "down");
    });

    await act(async () => {
      await result.current.saveOrder();
    });

    expect(updateCategoryOrderMock).toHaveBeenCalledWith({
      order: ["Infra", "Media"],
    });
    expect(result.current.error).toBeNull();
    expect(result.current.isReorderMode).toBe(false);
    expect(result.current.visibleCategoryOrder).toEqual([
      "Infra",
      "Media",
      "Uncategorized",
    ]);
  });

  it("captures load and save failures", async () => {
    fetchCategoryOrderMock.mockRejectedValueOnce(new Error("load failed"));
    updateCategoryOrderMock.mockRejectedValueOnce(new Error("save failed"));

    const { result } = renderHook(() => useCategoryOrder(services));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("load failed");

    act(() => {
      result.current.beginReorder();
      result.current.reorderCategories("Media", "Infra");
    });

    await act(async () => {
      await result.current.saveOrder();
    });

    expect(result.current.error).toBe("save failed");
    expect(result.current.isReorderMode).toBe(true);
  });
});