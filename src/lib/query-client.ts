import { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  categories: ["categories"] as const,
  services: ["services"] as const,
  settings: (deviceId: string) => ["settings", deviceId] as const,
  settingsRoot: ["settings"] as const,
};

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The event channel tells us when shared data changes, so there is no need to refetch on
        // focus or on a timer; data stays fresh until an event or a mutation says otherwise.
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: Infinity,
      },
    },
  });
}

export const queryClient = createQueryClient();
