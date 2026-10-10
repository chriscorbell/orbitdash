import { useQueryClient } from "@tanstack/react-query";
import { useConfigChanges } from "@/hooks/useConfigChanges";
import { queryKeys } from "@/lib/query-client";

/**
 * Keeps cached server data in step with other tabs and devices: a config change event (or the tab
 * returning from the background) marks the affected queries stale so they refetch.
 */
export function useLiveQueries() {
  const queryClient = useQueryClient();

  useConfigChanges(["layout"], () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.services });
    void queryClient.invalidateQueries({ queryKey: queryKeys.categoryOrder });
  });

  useConfigChanges(["settings"], () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.settingsRoot });
  });
}
