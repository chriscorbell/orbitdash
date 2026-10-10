// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query";
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
    icon_source_url: null,
    category: "Media",
    category_id: "cat-media",
    position: 0,
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
    icon_source_url: null,
    category: "Infra",
    category_id: "cat-infra",
    position: 0,
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
    icon_source_url: null,
    category: null,
    category_id: null,
    position: 0,
    open_in_new_tab: true,
    created_at: 1,
    updated_at: 1,
  },
];

beforeEach(() => {
  vi.resetAllMocks();
});

describe("useCategoryOrder", () => {
  it("loads category order and exposes visible categories", async () => {
    fetchCategoryOrderMock.mockResolvedValue({ order: ["Media"] });

    const { result } = renderHook(() => useCategoryOrder(services), {
      wrapper: createQueryWrapper().wrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.namedCategories).toEqual(["Media", "Infra"]);
    expect(result.current.visibleCategoryOrder).toEqual(["Media", "Infra", "Uncategorized"]);
  });

  async function renderLoaded(order: string[] = ["Media", "Infra"]) {
    fetchCategoryOrderMock.mockResolvedValue({ order });
    const hook = renderHook(() => useCategoryOrder(services), {
      wrapper: createQueryWrapper().wrapper,
    });
    await waitFor(() => {
      expect(hook.result.current.loading).toBe(false);
    });
    act(() => {
      hook.result.current.beginReorder();
    });
    return hook;
  }

  it("saves right away when a category is moved", async () => {
    updateCategoryOrderMock.mockResolvedValue({ order: ["Infra", "Media"] });
    const { result } = await renderLoaded();

    await act(async () => {
      await result.current.moveCategory("Media", "down");
    });

    expect(updateCategoryOrderMock).toHaveBeenCalledWith({ order: ["Infra", "Media"] });
    expect(result.current.saveState).toBe("saved");
    expect(result.current.saving).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isReorderMode).toBe(true);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.visibleCategoryOrder).toEqual(["Infra", "Media", "Uncategorized"]);
  });

  it("saves right away when a category is dragged", async () => {
    updateCategoryOrderMock.mockResolvedValue({ order: ["Infra", "Media"] });
    const { result } = await renderLoaded();

    await act(async () => {
      await result.current.reorderCategories("Media", "Infra");
    });

    expect(updateCategoryOrderMock).toHaveBeenCalledWith({ order: ["Infra", "Media"] });
    expect(result.current.saveState).toBe("saved");
    expect(result.current.visibleCategoryOrder).toEqual(["Infra", "Media", "Uncategorized"]);
  });

  it("does not save moves that change nothing", async () => {
    const { result } = await renderLoaded();

    await act(async () => {
      await result.current.moveCategory("Media", "up");
      await result.current.moveCategory("Infra", "down");
      await result.current.moveCategory("Missing", "up");
      await result.current.reorderCategories("Media", "Media");
      await result.current.reorderCategories("Media", "Missing");
    });

    expect(updateCategoryOrderMock).not.toHaveBeenCalled();
    expect(result.current.saveState).toBe("idle");
  });

  it("shows the order as saving until the request finishes", async () => {
    let resolveSave: (value: { order: string[] }) => void = () => {};
    updateCategoryOrderMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    const { result } = await renderLoaded();

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.moveCategory("Media", "down");
    });

    expect(result.current.saveState).toBe("saving");
    expect(result.current.saving).toBe(true);
    expect(result.current.draftOrder).toEqual(["Infra", "Media"]);
    expect(result.current.visibleCategoryOrder).toEqual(["Media", "Infra", "Uncategorized"]);

    await act(async () => {
      resolveSave({ order: ["Infra", "Media"] });
      await pending;
    });

    expect(result.current.saveState).toBe("saved");
  });

  it("sends saves one at a time and reports only the latest result", async () => {
    let rejectFirst: (error: Error) => void = () => {};
    updateCategoryOrderMock
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
        })
      )
      .mockResolvedValueOnce({ order: ["Media", "Infra"] });
    const { result } = await renderLoaded();

    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.moveCategory("Media", "down");
    });
    act(() => {
      second = result.current.moveCategory("Media", "up");
    });
    await act(async () => {});

    expect(updateCategoryOrderMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectFirst(new Error("first failed"));
      await first;
      await second;
    });

    expect(updateCategoryOrderMock).toHaveBeenNthCalledWith(2, { order: ["Media", "Infra"] });
    expect(result.current.error).toBeNull();
    expect(result.current.saveState).toBe("saved");
  });

  it("keeps the failed order visible with an error until it is retried", async () => {
    updateCategoryOrderMock
      .mockRejectedValueOnce(new Error("save failed"))
      .mockRejectedValueOnce("network down")
      .mockResolvedValueOnce({ order: ["Infra", "Media"] });
    const { result } = await renderLoaded();

    await act(async () => {
      await result.current.moveCategory("Media", "down");
    });

    expect(result.current.saveState).toBe("error");
    expect(result.current.error).toBe("save failed");
    expect(result.current.isReorderMode).toBe(true);
    expect(result.current.isDirty).toBe(true);
    expect(result.current.draftOrder).toEqual(["Infra", "Media"]);
    expect(result.current.visibleCategoryOrder).toEqual(["Media", "Infra", "Uncategorized"]);

    await act(async () => {
      await result.current.saveOrder();
    });

    expect(result.current.error).toBe("Failed to save category order");

    await act(async () => {
      await result.current.saveOrder();
    });

    expect(updateCategoryOrderMock).toHaveBeenLastCalledWith({ order: ["Infra", "Media"] });
    expect(result.current.saveState).toBe("saved");
    expect(result.current.error).toBeNull();
  });

  it("drops an unsaved order and the save status when reordering ends", async () => {
    updateCategoryOrderMock.mockRejectedValueOnce(new Error("save failed"));
    const { result } = await renderLoaded();

    await act(async () => {
      await result.current.moveCategory("Media", "down");
    });

    act(() => {
      result.current.cancelReorder();
    });

    expect(result.current.isReorderMode).toBe(false);
    expect(result.current.saveState).toBe("idle");
    expect(result.current.error).toBeNull();
    expect(result.current.draftOrder).toEqual(["Media", "Infra"]);
  });

  it("captures load failures", async () => {
    fetchCategoryOrderMock.mockRejectedValueOnce(new Error("load failed"));

    const { result } = renderHook(() => useCategoryOrder(services), {
      wrapper: createQueryWrapper().wrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("load failed");
    expect(result.current.saveState).toBe("idle");
  });
});
