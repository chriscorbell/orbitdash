/** What a WMO weather code looks like, for the icon and the label. */
export type WeatherKind =
  "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

const CODES: Record<number, [WeatherKind, string]> = {
  0: ["clear", "Clear"],
  1: ["partly", "Mostly clear"],
  2: ["partly", "Partly cloudy"],
  3: ["cloudy", "Overcast"],
  45: ["fog", "Fog"],
  48: ["fog", "Freezing fog"],
  51: ["drizzle", "Light drizzle"],
  53: ["drizzle", "Drizzle"],
  55: ["drizzle", "Heavy drizzle"],
  56: ["drizzle", "Freezing drizzle"],
  57: ["drizzle", "Freezing drizzle"],
  61: ["rain", "Light rain"],
  63: ["rain", "Rain"],
  65: ["rain", "Heavy rain"],
  66: ["rain", "Freezing rain"],
  67: ["rain", "Freezing rain"],
  71: ["snow", "Light snow"],
  73: ["snow", "Snow"],
  75: ["snow", "Heavy snow"],
  77: ["snow", "Snow grains"],
  80: ["rain", "Light showers"],
  81: ["rain", "Showers"],
  82: ["rain", "Heavy showers"],
  85: ["snow", "Snow showers"],
  86: ["snow", "Heavy snow showers"],
  95: ["storm", "Thunderstorm"],
  96: ["storm", "Thunderstorm with hail"],
  99: ["storm", "Thunderstorm with hail"],
};

export function describeWeather(code: number): { kind: WeatherKind; label: string } {
  const [kind, label] = CODES[code] ?? ["cloudy", "Unknown"];
  return { kind, label };
}

/** A temperature rounded to whole degrees, with the degree sign only. */
export function formatTemperature(value: number): string {
  const rounded = Math.round(value);
  return `${Object.is(rounded, -0) ? 0 : rounded}°`;
}

/** "Sat" for a forecast date like "2026-10-10" (read as a calendar date, not a time). */
export function weekdayOf(date: string, locale?: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
    Date.UTC(year, month - 1, day)
  );
}
