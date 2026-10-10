import { jsonBody, request, requestJson } from "@/lib/api/client";
import * as z from "zod/mini";
import type { AgendaFeed, AgendaResponse, GeocodeResult, WeatherReport } from "@shared/types";
import type { WeatherLocation, WeatherUnits } from "@shared/dashboard-settings";

// Only the lazily loaded widgets and their settings use these.
export const weatherReportSchema = z.object({
  timezone: z.string(),
  current: z.object({
    temperature: z.number(),
    apparentTemperature: z.number(),
    weatherCode: z.number(),
    isDay: z.boolean(),
    windSpeed: z.number(),
    humidity: z.number(),
  }),
  daily: z.array(
    z.object({
      date: z.string(),
      weatherCode: z.number(),
      max: z.number(),
      min: z.number(),
      precipitationChance: z.nullable(z.number()),
    })
  ),
  units: z.object({ temperature: z.string(), windSpeed: z.string() }),
  fetchedAt: z.number(),
});

export const geocodeResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      region: z.nullable(z.string()),
      country: z.nullable(z.string()),
      latitude: z.number(),
      longitude: z.number(),
    })
  ),
});

export const agendaFeedSchema = z.object({ id: z.string(), name: z.string(), host: z.string() });
export const agendaFeedsResponseSchema = z.object({ feeds: z.array(agendaFeedSchema) });

export const agendaResponseSchema = z.object({
  events: z.array(
    z.object({
      id: z.string(),
      feedId: z.string(),
      title: z.string(),
      location: z.nullable(z.string()),
      allDay: z.boolean(),
      start: z.string(),
      end: z.string(),
    })
  ),
  errors: z.array(z.object({ feedId: z.string(), name: z.string(), error: z.string() })),
});

export const widgetQueryKeys = {
  weather: (location: WeatherLocation, units: WeatherUnits) =>
    ["widgets", "weather", location.latitude, location.longitude, units] as const,
  agenda: (days: number) => ["widgets", "agenda", days] as const,
  agendaRoot: ["widgets", "agenda"] as const,
  feeds: ["widgets", "feeds"] as const,
};

export function fetchWeather(
  location: WeatherLocation,
  units: WeatherUnits
): Promise<WeatherReport> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    units,
  });
  return requestJson(
    `/api/widgets/weather?${params}`,
    {},
    "Weather is unavailable right now",
    weatherReportSchema
  );
}

export async function searchPlaces(query: string): Promise<GeocodeResult[]> {
  const response = await requestJson(
    `/api/widgets/geocode?${new URLSearchParams({ q: query })}`,
    {},
    "Place search is unavailable right now",
    geocodeResponseSchema
  );
  return response.results;
}

export function fetchAgenda(days: number): Promise<AgendaResponse> {
  return requestJson(
    `/api/widgets/agenda?days=${days}`,
    {},
    "Couldn't load the calendar",
    agendaResponseSchema
  );
}

export async function fetchAgendaFeeds(): Promise<AgendaFeed[]> {
  const response = await requestJson(
    "/api/widgets/agenda/feeds",
    {},
    "Couldn't load calendars",
    agendaFeedsResponseSchema
  );
  return response.feeds;
}

export function addAgendaFeed(input: { name: string; url: string }): Promise<AgendaFeed> {
  return requestJson(
    "/api/widgets/agenda/feeds",
    jsonBody("POST", input),
    "Couldn't add that calendar",
    agendaFeedSchema
  );
}

export async function removeAgendaFeed(id: string): Promise<void> {
  await request(
    `/api/widgets/agenda/feeds/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    "Couldn't remove that calendar"
  );
}
