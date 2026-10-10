// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCategories } from "@/hooks/useCategories";
import * as api from "@/lib/api/categories";
import { queryKeys } from "@/lib/query-client";
import { createQueryWrapper } from "@/test/query";
import type { Category, Service } from "@shared/types";

vi.mock("@/lib/api/categories", () => ({
  createCategory: vi.fn(),
  deleteCategory: vi.fn(),
  fetchCategories: vi.fn(),
  renameCategory: vi.fn(),
  reorderCategories: vi.fn(),
}));

const media: Category = { id: "media", name: "Media", position: 0, created_at: 1, updated_at: 1 };
const infra: Category = { ...media, id: "infra", name: "Infra", position: 1 };
const plex: Service = {
  id: "plex",
  name: "Plex",
  url: "https://plex.example.com",
  description: null,
  icon: null,
  icon_source_url: null,
  category: "Media",
  category_id: "media",
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

function setup() {
  const query = createQueryWrapper();
  query.client.setQueryData(queryKeys.services, [plex]);
  const hook = renderHook(() => useCategories(), { wrapper: query.wrapper });
  return { ...hook, queryClient: query.client };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchCategories).mockResolvedValue([media, infra]);
});

describe("useCategories", () => {
  it("loads categories in order and reports load failures", async () => {
    const { result } = setup();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.categories).toEqual([media, infra]));

    vi.mocked(api.fetchCategories).mockRejectedValue(new Error("down"));
    const failed = setup();
    await waitFor(() => expect(failed.result.current.error).toBe("down"));
  });

  it("adds a created category to the end", async () => {
    const games = { ...media, id: "games", name: "Games", position: 2 };
    vi.mocked(api.createCategory).mockResolvedValue(games);
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.create("Games"));

    await waitFor(() =>
      expect(result.current.categories.map((category) => category.id)).toEqual([
        "media",
        "infra",
        "games",
      ])
    );
  });

  it("renames at once, on its services too, and rolls back if refused", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(api.renameCategory).mockReturnValue(new Promise((_, fail) => (reject = fail)));
    const { result, queryClient } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    let renamed!: Promise<Category>;
    act(() => {
      renamed = result.current.rename("media", "Movies");
    });
    await waitFor(() => expect(result.current.categories[0].name).toBe("Movies"));
    expect(queryClient.getQueryData<Service[]>(queryKeys.services)?.[0].category).toBe("Movies");

    await act(async () => {
      reject(new Error("taken"));
      await expect(renamed).rejects.toThrow("taken");
    });
    await waitFor(() => expect(result.current.categories[0].name).toBe("Media"));
    expect(queryClient.getQueryData<Service[]>(queryKeys.services)?.[0].category).toBe("Media");
  });

  it("deletes at once, uncategorizes its services and refreshes them", async () => {
    vi.mocked(api.deleteCategory).mockResolvedValue(undefined);
    const { result, queryClient } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await act(() => result.current.remove("media"));

    await waitFor(() =>
      expect(result.current.categories.map((category) => category.id)).toEqual(["infra"])
    );
    expect(queryClient.getQueryData<Service[]>(queryKeys.services)?.[0]).toMatchObject({
      category: null,
      category_id: null,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.services });
  });

  it("restores a category whose delete failed", async () => {
    vi.mocked(api.deleteCategory).mockRejectedValue(new Error("nope"));
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.remove("media")).rejects.toThrow("nope");
    });
    await waitFor(() =>
      expect(result.current.categories.map((category) => category.id)).toEqual(["media", "infra"])
    );
  });

  it("reorders at once and keeps the server's answer", async () => {
    const saved = [
      { ...infra, position: 0 },
      { ...media, position: 1 },
    ];
    vi.mocked(api.reorderCategories).mockResolvedValue(saved);
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.reorder(["infra", "media"]));

    await waitFor(() => expect(result.current.categories).toEqual(saved));
  });

  it("puts the old order back if reordering fails", async () => {
    vi.mocked(api.reorderCategories).mockRejectedValue(new Error("offline"));
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.reorder(["infra", "media"])).rejects.toThrow("offline");
    });
    await waitFor(() =>
      expect(result.current.categories.map((category) => category.id)).toEqual(["media", "infra"])
    );
  });
});
