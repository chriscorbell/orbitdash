import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConfigChanges } from "@/hooks/useConfigChanges";
import { fetchAgenda, fetchAgendaFeeds, fetchWeather, widgetQueryKeys } from "@/lib/api/widgets";
import type { DashboardWidgetSettings } from "@shared/dashboard-settings";

/** The forecast for the saved location, refreshed every ten minutes like the server's cache. */
export function useWeather(widgets: DashboardWidgetSettings) {
  const location = widgets.weatherLocation;
  return useQuery({
    queryKey: location
      ? widgetQueryKeys.weather(location, widgets.weatherUnits)
      : ["widgets", "weather", "none"],
    queryFn: () => fetchWeather(location!, widgets.weatherUnits),
    enabled: widgets.weather && location !== null,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });
}

/** Upcoming events, refreshed every five minutes and when calendars change in another tab. */
export function useAgenda(widgets: DashboardWidgetSettings) {
  const queryClient = useQueryClient();
  useConfigChanges(["settings"], () => {
    void queryClient.invalidateQueries({ queryKey: widgetQueryKeys.agendaRoot });
    void queryClient.invalidateQueries({ queryKey: widgetQueryKeys.feeds });
  });
  const agenda = useQuery({
    queryKey: widgetQueryKeys.agenda(widgets.agendaDays),
    queryFn: () => fetchAgenda(widgets.agendaDays),
    enabled: widgets.agenda,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const feeds = useQuery({
    queryKey: widgetQueryKeys.feeds,
    queryFn: fetchAgendaFeeds,
    enabled: widgets.agenda,
  });
  return { agenda, feeds };
}
