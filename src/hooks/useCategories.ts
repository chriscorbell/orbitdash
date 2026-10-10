import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api/categories";
import { queryKeys } from "@/lib/query-client";
import type { Category, Service } from "@shared/types";

const EMPTY: Category[] = [];

/**
 * Categories in display order, empty ones included. Renames, deletes and reorders show at once and
 * roll back if the server refuses; callers report the error.
 */
export function useCategories() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.categories, queryFn: api.fetchCategories });

  const snapshot = useCallback(
    () => ({
      categories: queryClient.getQueryData<Category[]>(queryKeys.categories),
      services: queryClient.getQueryData<Service[]>(queryKeys.services),
    }),
    [queryClient]
  );

  const rollback = useCallback(
    (previous: ReturnType<typeof snapshot> | undefined) => {
      if (!previous) return;
      queryClient.setQueryData(queryKeys.categories, previous.categories);
      queryClient.setQueryData(queryKeys.services, previous.services);
    },
    [queryClient]
  );

  const setCategories = useCallback(
    (update: (current: Category[]) => Category[]) =>
      queryClient.setQueryData<Category[]>(queryKeys.categories, (current) =>
        update(current ?? [])
      ),
    [queryClient]
  );

  const setServices = useCallback(
    (update: (current: Service[]) => Service[]) =>
      queryClient.setQueryData<Service[]>(queryKeys.services, (current) =>
        current ? update(current) : current
      ),
    [queryClient]
  );

  const createMutation = useMutation({
    mutationFn: (name: string) => api.createCategory(name),
    onSuccess: (category) => setCategories((current) => [...current, category]),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.renameCategory(id, name),
    onMutate: ({ id, name }) => {
      const previous = snapshot();
      setCategories((current) =>
        current.map((category) => (category.id === id ? { ...category, name } : category))
      );
      setServices((current) =>
        current.map((service) =>
          service.category_id === id ? { ...service, category: name } : service
        )
      );
      return previous;
    },
    onError: (_error, _variables, previous) => rollback(previous),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.deleteCategory(id),
    onMutate: (id) => {
      const previous = snapshot();
      setCategories((current) => current.filter((category) => category.id !== id));
      setServices((current) =>
        current.map((service) =>
          service.category_id === id ? { ...service, category: null, category_id: null } : service
        )
      );
      return previous;
    },
    onError: (_error, _id, previous) => rollback(previous),
    // Its services were appended to the uncategorized group, so their positions changed.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.services }),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => api.reorderCategories(ids),
    onMutate: (ids) => {
      const previous = snapshot();
      setCategories((current) =>
        [...current]
          .sort((left, right) => ids.indexOf(left.id) - ids.indexOf(right.id))
          .map((category, position) => ({ ...category, position }))
      );
      return previous;
    },
    onError: (_error, _ids, previous) => rollback(previous),
    onSuccess: (categories) => queryClient.setQueryData(queryKeys.categories, categories),
  });

  const { mutateAsync: createAsync } = createMutation;
  const { mutateAsync: renameAsync } = renameMutation;
  const { mutateAsync: removeAsync } = removeMutation;
  const { mutateAsync: reorderAsync } = reorderMutation;

  return {
    categories: query.data ?? EMPTY,
    loading: query.isPending,
    error: query.error ? query.error.message || "Failed to load categories" : null,
    create: useCallback((name: string) => createAsync(name), [createAsync]),
    rename: useCallback((id: string, name: string) => renameAsync({ id, name }), [renameAsync]),
    remove: useCallback((id: string) => removeAsync(id), [removeAsync]),
    reorder: useCallback((ids: string[]) => reorderAsync(ids), [reorderAsync]),
  };
}

export type UseCategoriesResult = ReturnType<typeof useCategories>;
