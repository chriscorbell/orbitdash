import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateServicePayload, Service, UpdateServicePayload } from "@shared/types";
import * as api from "@/lib/api/services";
import { applyServiceMove, compareServices, type ServiceMove } from "@/lib/board-groups";
import { queryKeys } from "@/lib/query-client";

/** Services keep their saved position within a category; grouping happens in the view. */
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload, iconFile, removeIcon }: UpdateVariables) =>
      api.updateService(id, payload, iconFile, removeIcon),
    onSuccess: (service) => {
      setServices((current) => current.map((entry) => (entry.id === service.id ? service : entry)));
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
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

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.restoreService(id),
    onSuccess: async (service) => {
      setServices((current) => [...current.filter((entry) => entry.id !== service.id), service]);
      // Restoring can shift its neighbours' positions.
      await refetchServices();
    },
  });

  // Shows the move at once, rolls back if the server refuses, then takes the server's positions.
  const moveMutation = useMutation({
    mutationFn: (move: ServiceMove) =>
      api.moveService(move.id, { category_id: move.categoryId, index: move.index }),
    onMutate: (move) => {
      const previous = queryClient.getQueryData<Service[]>(queryKeys.services);
      setServices((current) => applyServiceMove(current, move));
      return previous;
    },
    onError: (_error, _move, previous) => {
      queryClient.setQueryData(queryKeys.services, previous);
    },
    onSettled: () => refetchServices(),
  });

  const { mutateAsync: createAsync } = createMutation;
  const { mutateAsync: updateAsync } = updateMutation;
  const { mutateAsync: duplicateAsync } = duplicateMutation;
  const { mutateAsync: removeAsync } = removeMutation;
  const { mutateAsync: moveAsync } = moveMutation;
  const { mutateAsync: restoreAsync } = restoreMutation;

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
  const restore = useCallback((id: string) => restoreAsync(id), [restoreAsync]);
  const move = useCallback((serviceMove: ServiceMove) => moveAsync(serviceMove), [moveAsync]);
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
    restore,
    move,
    reload,
  };
}
