import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConfigChanges } from "@/hooks/useConfigChanges";
import { fetchIntegrationReadings, subscribeIntegrations } from "@/lib/api/integrations";
import { eventStream } from "@/lib/live/event-stream";
import {
  INTEGRATION_READINGS_KEY,
  setIntegrationReadings,
  updateIntegrationReading,
} from "@/lib/integration-readings";

/**
 * Loads integration figures for every card and keeps them current from the event stream. Renders
 * nothing; cards read the figures with useIntegrationReading.
 */
export function IntegrationLayer() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: INTEGRATION_READINGS_KEY,
    queryFn: fetchIntegrationReadings,
    staleTime: 60_000,
    // A page that stays open keeps telling the server it's looking.
    refetchInterval: 4 * 60_000,
  });
  const refetch = () => void queryClient.invalidateQueries({ queryKey: INTEGRATION_READINGS_KEY });
  useConfigChanges(["settings", "layout"], refetch);

  useEffect(() => {
    if (data) setIntegrationReadings(data);
  }, [data]);

  useEffect(() => {
    const unsubscribe = subscribeIntegrations(updateIntegrationReading);
    const offConnection = eventStream.onConnection((event) => {
      if (event !== "error") {
        void queryClient.invalidateQueries({ queryKey: INTEGRATION_READINGS_KEY });
      }
    });
    return () => {
      unsubscribe();
      offConnection();
    };
  }, [queryClient]);

  return null;
}
