import { useState, useEffect, useCallback } from "react";
import type { Service, CreateServicePayload, UpdateServicePayload } from "@/shared/types";
import * as api from "@/lib/api";

export function useServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.fetchServices();
      setServices(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load services");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(
    async (payload: CreateServicePayload, iconFile?: File) => {
      const service = await api.createService(payload, iconFile);
      setServices((prev) => [...prev, service]);
      return service;
    },
    []
  );

  const update = useCallback(
    async (id: string, payload: UpdateServicePayload, iconFile?: File, removeIcon?: boolean) => {
      const service = await api.updateService(id, payload, iconFile, removeIcon);
      setServices((prev) => prev.map((s) => (s.id === id ? service : s)));
      return service;
    },
    []
  );

  const remove = useCallback(async (id: string) => {
    await api.deleteService(id);
    setServices((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { services, loading, error, create, update, remove, reload: load };
}
