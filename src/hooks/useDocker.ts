import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDocker, subscribeContainers } from "@/lib/api/docker";
import { eventStream } from "@/lib/live/event-stream";

export const DOCKER_QUERY_KEY = ["docker"] as const;

/** The container list, kept current from the event stream and refetched after reconnecting. */
export function useDocker() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: DOCKER_QUERY_KEY, queryFn: fetchDocker, staleTime: 60_000 });

  useEffect(() => {
    const unsubscribe = subscribeContainers((snapshot) =>
      queryClient.setQueryData(DOCKER_QUERY_KEY, snapshot)
    );
    const offConnection = eventStream.onConnection((event) => {
      if (event !== "error") void queryClient.invalidateQueries({ queryKey: DOCKER_QUERY_KEY });
    });
    return () => {
      unsubscribe();
      offConnection();
    };
  }, [queryClient]);

  return query;
}
