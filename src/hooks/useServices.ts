import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateServicePayload,
  RenameCategoryResponse,
  Service,
  UpdateServicePayload,
} from "@shared/types";
import { renameCategory as renameCategoryRequest } from "@/lib/api/categories";
import * as api from "@/lib/api/services";
import { queryKeys } from "@/lib/query-client";

/** Services keep their saved position within a category; grouping happens in the view. */
function compareServices(left: Service, right: Service) {
  return left.position - right.position || left.name.localeCompare(right.name);
}

function sortServices(services: readonly Service[]) {
  return [...services].sort(compareServices);
}

interface UpdateVariables {
  iconFile?: File;
  id: string;
  payload: UpdateServicePayload;
  removeIcon?: boolean;
}

const EMPTY: Service[] = [];

/**
 * Services from the server, cached and shared by every component. Mutations write their result
 * straight into the cache; the server also re-orders positions (duplicates, moves), so those
 * refetch the list afterwards.
 */
export function useServices() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.services,
    queryFn: async () => sortServices(await api.fetchServices()),
  });

  const setServices = useCallback(
    (update: (current: Service[]) => Service[]) => {
      queryClient.setQueryData<Service[]>(queryKeys.services, (current) =>
        sortServices(update(current ?? []))
      );
    },
    [queryClient]
  );

  const refetchServices = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.services }),
    [queryClient]
  );

  const createMutation = useMutation({
    mutationFn: ({ payload, iconFile }: { iconFile?: File; payload: CreateServicePayload }) =>
      api.createService(payload, iconFile),
    onSuccess: (service) => {
      setServices((current) => [...current, service]);
      // A new category may have been created along the way.
      void queryClient.invalidateQueries({ queryKey: queryKeys.categoryOrder });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload, iconFile, removeIcon }: UpdateVariables) =>
      api.updateService(id, payload, iconFile, removeIcon),
    onSuccess: (service) => {
      setServices((current) => current.map((entry) => (entry.id === service.id ? service : entry)));
      void queryClient.invalidateQueries({ queryKey: queryKeys.categoryOrder });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.duplicateService(id),
    onSuccess: async (service) => {
      setServices((current) => [...current, service]);
      await refetchServices();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.deleteService(id),
    onSuccess: (_result, id) => {
      setServices((current) => current.filter((entry) => entry.id !== id));
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => renameCategoryRequest({ from, to }),
    onSuccess: (response: RenameCategoryResponse) => {
      setServices(() => response.services);
      queryClient.setQueryData(queryKeys.categoryOrder, { order: response.order });
    },
  });

  const { mutateAsync: createAsync } = createMutation;
  const { mutateAsync: updateAsync } = updateMutation;
  const { mutateAsync: duplicateAsync } = duplicateMutation;
  const { mutateAsync: removeAsync } = removeMutation;
  const { mutateAsync: renameAsync } = renameMutation;

  const create = useCallback(
    (payload: CreateServicePayload, iconFile?: File) => createAsync({ payload, iconFile }),
    [createAsync]
  );
  const update = useCallback(
    (id: string, payload: UpdateServicePayload, iconFile?: File, removeIcon?: boolean) =>
      updateAsync({ id, payload, iconFile, removeIcon }),
    [updateAsync]
  );
  const duplicate = useCallback((id: string) => duplicateAsync(id), [duplicateAsync]);
  const remove = useCallback((id: string) => removeAsync(id), [removeAsync]);
  const renameCategory = useCallback(
    (from: string, to: string) => renameAsync({ from, to }),
    [renameAsync]
  );
  const reload = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    services: query.data ?? EMPTY,
    loading: query.isPending || query.isRefetching,
    error: query.error ? query.error.message || "Failed to load services" : null,
    create,
    update,
    duplicate,
    remove,
    renameCategory,
    reload,
  };
}
