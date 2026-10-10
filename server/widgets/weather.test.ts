import { describe, expect, it } from "bun:test";
import {
  createWeatherService,
  parseForecast,
  parseGeocode,
  WeatherUnavailableError,
} from "./weather";

const FORECAST = {
  timezone: "America/Los_Angeles",
  current_units: { temperature_2m: "°F", wind_speed_10m: "mp/h" },
  current: {
    temperature_2m: 50.5,
    apparent_temperature: 46,
    weather_code: 3,
    is_day: 0,
    wind_speed_10m: 6.3,
    relative_humidity_2m: 73,
  },
  daily: {
    time: ["2026-10-10", "2026-10-11", 42],
    weather_code: [51, 0, 1],
    temperature_2m_max: [62.4, 64, 1],
    temperature_2m_min: [48.3, 45, 1],
    precipitation_probability_max: [41, null, 1],
  },
};

describe("parseForecast", () => {
  it("keeps what the widget shows", () => {
    expect(parseForecast(FORECAST, 5)).toEqual({
      timezone: "America/Los_Angeles",
      current: {
        temperature: 50.5,
        apparentTemperature: 46,
        weatherCode: 3,
        isDay: false,
        windSpeed: 6.3,
        humidity: 73,
      },
      daily: [
        { date: "2026-10-10", weatherCode: 51, max: 62.4, min: 48.3, precipitationChance: 41 },
        { date: "2026-10-11", weatherCode: 0, max: 64, min: 45, precipitationChance: null },
      ],
      units: { temperature: "°F", windSpeed: "mp/h" },
      fetchedAt: 5,
    });
  });

  it("fills gaps and rejects answers without current conditions", () => {
    expect(
      parseForecast({ current: { temperature_2m: 10, weather_code: 0 }, daily: {} }, 1)
    ).toEqual({
      timezone: "UTC",
      current: {
        temperature: 10,
        apparentTemperature: 10,
        weatherCode: 0,
        isDay: true,
        windSpeed: 0,
        humidity: 0,
      },
      daily: [],
      units: { temperature: "°C", windSpeed: "km/h" },
      fetchedAt: 1,
    });
    expect(parseForecast({ current: { weather_code: 1 }, daily: {} }, 1)).toBeNull();
    expect(parseForecast({ error: true }, 1)).toBeNull();
    expect(parseForecast(null, 1)).toBeNull();
  });
});

describe("parseGeocode", () => {
  it("reads places and skips incomplete ones", () => {
    expect(
      parseGeocode({
        results: [
          {
            id: 5746545,
            name: "Portland",
            latitude: 45.52,
            longitude: -122.68,
            admin1: "Oregon",
            country: "United States",
          },
          { id: 2, name: "Nowhere" },
          "x",
        ],
      })
    ).toEqual([
      {
        id: 5746545,
        name: "Portland",
        region: "Oregon",
        country: "United States",
        latitude: 45.52,
        longitude: -122.68,
      },
    ]);
    // Open-Meteo leaves `results` out when nothing matches.
    expect(parseGeocode({ generationtime_ms: 0.4 })).toEqual([]);
  });
});

describe("weather service", () => {
  function setup(respond: (url: string) => Response | Promise<Response>) {
    const urls: string[] = [];
    let now = 0;
    const service = createWeatherService({
      fetch: async (url) => {
        urls.push(url);
        return respond(url);
      },
      now: () => now,
    });
    return { service, urls, advance: (ms: number) => (now += ms) };
  }

  it("asks for imperial units and caches nearby requests for ten minutes", async () => {
    const { service, urls, advance } = setup(() => Response.json(FORECAST));
    const report = await service.forecast(45.5231, -122.6765, "imperial");
    expect(report.current.temperature).toBe(50.5);
    await service.forecast(45.5249, -122.6801, "imperial");
    expect(urls).toHaveLength(1);
    const params = new URL(urls[0]).searchParams;
    expect(params.get("latitude")).toBe("45.52");
    expect(params.get("longitude")).toBe("-122.68");
    expect(params.get("temperature_unit")).toBe("fahrenheit");
    expect(params.get("wind_speed_unit")).toBe("mph");
    expect(params.get("timezone")).toBe("auto");

    await service.forecast(45.5231, -122.6765, "metric");
    expect(new URL(urls[1]).searchParams.get("temperature_unit")).toBeNull();
    advance(10 * 60_000);
    await service.forecast(45.5231, -122.6765, "imperial");
    expect(urls).toHaveLength(3);
  });

  it("reports outages and doesn't cache them", async () => {
    let answer: () => Response | Promise<Response> = () => new Response("down", { status: 502 });
    const { service, urls } = setup(() => answer());
    await expect(service.forecast(1, 2, "metric")).rejects.toThrow("Open-Meteo answered 502");
    answer = () => Promise.reject(new Error("offline"));
    await expect(service.forecast(1, 2, "metric")).rejects.toBeInstanceOf(WeatherUnavailableError);
    answer = () => Response.json({ nope: true });
    await expect(service.forecast(1, 2, "metric")).rejects.toThrow("unexpected answer");
    answer = () => Response.json(FORECAST);
    await expect(service.forecast(1, 2, "metric")).resolves.toMatchObject({
      timezone: expect.any(String),
    });
    expect(urls).toHaveLength(4);
  });

  it("geocodes names of two or more characters", async () => {
    const { service, urls } = setup(() =>
      Response.json({ results: [{ id: 1, name: "Berlin", latitude: 52.5, longitude: 13.4 }] })
    );
    expect(await service.geocode(" b ")).toEqual([]);
    expect(await service.geocode("Berlin")).toHaveLength(1);
    expect(await service.geocode("berlin")).toHaveLength(1);
    expect(urls).toHaveLength(1);
    expect(new URL(urls[0]).searchParams.get("name")).toBe("Berlin");
  });

  it("evicts the oldest entry once the cache is full", async () => {
    const { service, urls } = setup(() => Response.json({ results: [] }));
    for (let index = 0; index < 201; index += 1) await service.geocode(`place ${index}`);
    await service.geocode("place 0");
    expect(urls).toHaveLength(202);
  });
});
