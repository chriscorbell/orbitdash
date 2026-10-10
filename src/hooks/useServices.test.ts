// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query";
import { useServices } from "@/hooks/useServices";
import * as servicesApi from "@/lib/api/services";
import type { Service } from "@shared/types";

vi.mock("@/lib/api/services", () => ({
  createService: vi.fn(),
  deleteService: vi.fn(),
  restoreService: vi.fn(),
  duplicateService: vi.fn(),
  fetchServices: vi.fn(),
  moveService: vi.fn(),
  updateService: vi.fn(),
}));

const fetchServicesMock = vi.mocked(servicesApi.fetchServices);
const createServiceMock = vi.mocked(servicesApi.createService);
const updateServiceMock = vi.mocked(servicesApi.updateService);
const deleteServiceMock = vi.mocked(servicesApi.deleteService);
const duplicateServiceMock = vi.mocked(servicesApi.duplicateService);
const restoreServiceMock = vi.mocked(servicesApi.restoreService);
const moveServiceMock = vi.mocked(servicesApi.moveService);

const existingService: Service = {
  id: "svc-1",
  name: "Orbit",
  url: "https://example.com/orbit",
  description: "Dashboard",
  icon: null,
  icon_source_url: null,
  category: "Infra",
  category_id: "cat-infra",
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useServices", () => {
  it("loads services on mount", async () => {
    fetchServicesMock.mockResolvedValue([existingService]);

    const { result } = renderHook(() => useServices(), { wrapper: createQueryWrapper().wrapper });

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.services).toEqual([existingService]));
  });

  it("captures load errors", async () => {
    fetchServicesMock.mockRejectedValue(new Error("load failed"));

    const { result } = renderHook(() => useServices(), { wrapper: createQueryWrapper().wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await waitFor(() => expect(result.current.services).toEqual([]));
    expect(result.current.error).toBe("load failed");
  });

  it("adds a duplicated service to local state", async () => {
    const duplicatedService: Service = {
      ...existingService,
      id: "svc-copy",
      name: "Orbit (copy)",
    };

    fetchServicesMock
      .mockResolvedValueOnce([existingService])
      .mockResolvedValueOnce([existingService, duplicatedService]);
    duplicateServiceMock.mockResolvedValue(duplicatedService);

    const { result } = renderHook(() => useServices(), { wrapper: createQueryWrapper().wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.duplicate(existingService.id);
    });

    expect(duplicateServiceMock).toHaveBeenCalledWith(existingService.id);
    await waitFor(() =>
      expect(result.current.services).toEqual([existingService, duplicatedService])
    );
  });

  it("updates local state for create, update, delete, and reload", async () => {
    const createdService: Service = {
      ...existingService,
      id: "svc-2",
      name: "Grafana",
      url: "https://example.com/grafana",
    };
    const updatedService: Service = {
      ...existingService,
      name: "Aardvark",
      updated_at: 2,
    };

    fetchServicesMock
      .mockResolvedValueOnce([existingService])
      .mockResolvedValueOnce([updatedService]);
    createServiceMock.mockResolvedValue(createdService);
    updateServiceMock.mockResolvedValue(updatedService);
    deleteServiceMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useServices(), { wrapper: createQueryWrapper().wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.create({
        name: createdService.name,
        url: createdService.url,
      });
    });

    await waitFor(() => expect(result.current.services).toEqual([createdService, existingService]));

    await act(async () => {
      await result.current.update(existingService.id, {
        name: updatedService.name,
      });
    });

    await waitFor(() => expect(result.current.services).toEqual([updatedService, createdService]));

    await act(async () => {
      await result.current.remove(createdService.id);
    });

    await waitFor(() => expect(result.current.services).toEqual([updatedService]));

    await act(async () => {
      await result.current.reload();
    });

    expect(fetchServicesMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.services).toEqual([updatedService]));
  });

  it("restores a deleted service and refetches positions", async () => {
    fetchServicesMock
      .mockResolvedValueOnce([existingService])
      .mockResolvedValueOnce([existingService]);
    deleteServiceMock.mockResolvedValue(undefined);
    restoreServiceMock.mockResolvedValue(existingService);

    const { result } = renderHook(() => useServices(), { wrapper: createQueryWrapper().wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove(existingService.id);
    });
    await waitFor(() => expect(result.current.services).toEqual([]));

    await act(async () => {
      await result.current.restore(existingService.id);
    });
    await waitFor(() => expect(result.current.services).toEqual([existingService]));
    expect(fetchServicesMock).toHaveBeenCalledTimes(2);
  });

  it("moves a service at once, then takes the server's order", async () => {
    const other = { ...existingService, id: "svc-2", name: "Other", position: 1 };
    fetchServicesMock.mockResolvedValue([existingService, other]);
    let resolveMove!: (service: Service) => void;
    moveServiceMock.mockReturnValue(new Promise((resolve) => (resolveMove = resolve)));

    const { result } = renderHook(() => useServices(), { wrapper: createQueryWrapper().wrapper });
    await waitFor(() => expect(result.current.services).toHaveLength(2));

    let moved!: Promise<Service>;
    act(() => {
      moved = result.current.move({
        id: "svc-2",
        categoryId: "cat-infra",
        categoryName: "Infra",
        index: 0,
      });
    });

    await waitFor(() =>
      expect(result.current.services.map((service) => service.id)).toEqual(["svc-2", "svc-1"])
    );
    expect(moveServiceMock).toHaveBeenCalledWith("svc-2", { category_id: "cat-infra", index: 0 });

    fetchServicesMock.mockResolvedValue([
      { ...other, position: 0 },
      { ...existingService, position: 1 },
    ]);
    await act(async () => {
      resolveMove({ ...other, position: 0 });
      await moved;
    });
    await waitFor(() => expect(fetchServicesMock).toHaveBeenCalledTimes(2));
  });

  it("rolls a refused move back", async () => {
    const other = { ...existingService, id: "svc-2", name: "Other", position: 1 };
    fetchServicesMock.mockResolvedValue([existingService, other]);
    moveServiceMock.mockRejectedValue(new Error("nope"));

    const { result } = renderHook(() => useServices(), { wrapper: createQueryWrapper().wrapper });
    await waitFor(() => expect(result.current.services).toHaveLength(2));

    await act(async () => {
      await expect(
        result.current.move({ id: "svc-2", categoryId: null, categoryName: null, index: 0 })
      ).rejects.toThrow("nope");
    });

    await waitFor(() =>
      expect(result.current.services.find((service) => service.id === "svc-2")?.category_id).toBe(
        "cat-infra"
      )
    );
  });
});
