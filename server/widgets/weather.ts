import type { GeocodeResult, WeatherReport } from "@shared/types";
import type { WeatherUnits } from "@shared/dashboard-settings";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FETCH_TIMEOUT_MS = 8_000;
const WEATHER_TTL_MS = 10 * 60_000;
const GEOCODE_TTL_MS = 24 * 60 * 60_000;
const MAX_CACHE_ENTRIES = 200;

export class WeatherUnavailableError extends Error {}

export interface WeatherDependencies {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  now: () => number;
}

const defaultDependencies: WeatherDependencies = {
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** The parts of an Open-Meteo forecast the widget shows, or null when it's not one. */
export function parseForecast(data: unknown, fetchedAt: number): WeatherReport | null {
  if (!isRecord(data) || !isRecord(data.current) || !isRecord(data.daily)) return null;
  const { current, daily } = data;
  const currentUnits = isRecord(data.current_units) ? data.current_units : {};
  const temperature = num(current.temperature_2m);
  const weatherCode = num(current.weather_code);
  if (temperature === null || weatherCode === null) return null;

  const dates = Array.isArray(daily.time) ? daily.time : [];
  const column = (name: string) => (Array.isArray(daily[name]) ? (daily[name] as unknown[]) : []);
  const days = dates.flatMap((date, index) => {
    const max = num(column("temperature_2m_max")[index]);
    const min = num(column("temperature_2m_min")[index]);
    const code = num(column("weather_code")[index]);
    if (typeof date !== "string" || max === null || min === null || code === null) return [];
    return [
      {
        date,
        weatherCode: code,
        max,
        min,
        precipitationChance: num(column("precipitation_probability_max")[index]),
      },
    ];
  });

  return {
    timezone: str(data.timezone) ?? "UTC",
    current: {
      temperature,
      apparentTemperature: num(current.apparent_temperature) ?? temperature,
      weatherCode,
      isDay: current.is_day !== 0,
      windSpeed: num(current.wind_speed_10m) ?? 0,
      humidity: num(current.relative_humidity_2m) ?? 0,
    },
    daily: days,
    units: {
      temperature: str(currentUnits.temperature_2m) ?? "°C",
      windSpeed: str(currentUnits.wind_speed_10m) ?? "km/h",
    },
    fetchedAt,
  };
}

export function parseGeocode(data: unknown): GeocodeResult[] {
  if (!isRecord(data) || !Array.isArray(data.results)) return [];
  return data.results.filter(isRecord).flatMap((result) => {
    const id = num(result.id);
    const name = str(result.name);
    const latitude = num(result.latitude);
    const longitude = num(result.longitude);
    if (id === null || !name || latitude === null || longitude === null) return [];
    return [
      {
        id,
        name,
        region: str(result.admin1),
        country: str(result.country),
        latitude,
        longitude,
      },
    ];
  });
}

/**
 * Weather and place search from Open-Meteo, which needs no API key. Answers are cached briefly so
 * every open dashboard shares one upstream request.
 */
export function createWeatherService(deps: WeatherDependencies = defaultDependencies) {
  const cache = new Map<string, { at: number; value: Promise<unknown> }>();

  function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit && deps.now() - hit.at < ttl) return hit.value as Promise<T>;
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
    const value = load();
    cache.set(key, { at: deps.now(), value });
    // A failure isn't cached; the next request tries again.
    value.catch(() => cache.delete(key));
    return value;
  }

  async function getJson(url: string): Promise<unknown> {
    let response: Response;
    try {
      response = await deps.fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch {
      throw new WeatherUnavailableError("Open-Meteo can't be reached right now");
    }
    if (!response.ok) throw new WeatherUnavailableError(`Open-Meteo answered ${response.status}`);
    return response.json();
  }

  return {
    forecast(latitude: number, longitude: number, units: WeatherUnits): Promise<WeatherReport> {
      // About a kilometer of rounding: nearby dashboards share a cache entry.
      const lat = latitude.toFixed(2);
      const lon = longitude.toFixed(2);
      return cached(`forecast:${lat},${lon},${units}`, WEATHER_TTL_MS, async () => {
        const params = new URLSearchParams({
          latitude: lat,
          longitude: lon,
          current:
            "temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m",
          daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
          timezone: "auto",
          forecast_days: "6",
        });
        if (units === "imperial") {
          params.set("temperature_unit", "fahrenheit");
          params.set("wind_speed_unit", "mph");
        }
        const report = parseForecast(await getJson(`${FORECAST_URL}?${params}`), deps.now());
        if (!report) throw new WeatherUnavailableError("Open-Meteo sent an unexpected answer");
        return report;
      });
    },

    geocode(query: string): Promise<GeocodeResult[]> {
      const name = query.trim().slice(0, 100);
      if (name.length < 2) return Promise.resolve([]);
      return cached(`geocode:${name.toLowerCase()}`, GEOCODE_TTL_MS, async () => {
        const params = new URLSearchParams({ name, count: "6", language: "en", format: "json" });
        return parseGeocode(await getJson(`${GEOCODE_URL}?${params}`));
      });
    },
  };
}

export const weatherService = createWeatherService();
