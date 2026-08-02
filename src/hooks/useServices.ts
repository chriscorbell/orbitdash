import { useState, useEffect, useCallback } from "react";
import type { Service, CreateServicePayload, UpdateServicePayload } from "@shared/types";
import * as api from "@/lib/api/services";
import { renameCategory as renameCategoryRequest } from "@/lib/api/categories";

function compareServices(left: Service, right: Service) {
  const leftCategory = left.category ?? "";
  const rightCategory = right.category ?? "";
  const categoryComparison = leftCategory.localeCompare(rightCategory);

  if (categoryComparison !== 0) {
    return categoryComparison;
  }

  return left.name.localeCompare(right.name);
}

function sortServices(services: Service[]) {
  return [...services].sort(compareServices);
}

export function useServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // No sync setLoading(true) here: loading starts true, and effects may not set state synchronously
  const load = useCallback(async () => {
    try {
      const data = await api.fetchServices();
      setServices(sortServices(data));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load services");
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  useEffect(() => {
    // load only sets state after awaiting the fetch; the rule can't see through the callback
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const create = useCallback(async (payload: CreateServicePayload, iconFile?: File) => {
    const service = await api.createService(payload, iconFile);
    setServices((prev) => sortServices([...prev, service]));
    return service;
  }, []);

  const update = useCallback(
    async (id: string, payload: UpdateServicePayload, iconFile?: File, removeIcon?: boolean) => {
      const service = await api.updateService(id, payload, iconFile, removeIcon);
      setServices((prev) => sortServices(prev.map((s) => (s.id === id ? service : s))));
      return service;
    },
    []
  );

  const remove = useCallback(async (id: string) => {
    await api.deleteService(id);
    setServices((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const renameCategory = useCallback(async (from: string, to: string) => {
    const response = await renameCategoryRequest({ from, to });
    setServices(sortServices(response.services));
    return response;
  }, []);

  return { services, loading, error, create, update, remove, renameCategory, reload };
}
