import { describe, expect, it } from "vitest";
import {
  agendaFeedCreateSchema,
  agendaFeedSchema,
  agendaFeedsResponseSchema,
  agendaResponseSchema,
  geocodeResponseSchema,
  weatherQuerySchema,
  weatherReportSchema,
} from "./widget-schemas";

describe("widget request schemas", () => {
  it("reads weather queries from strings", () => {
    expect(weatherQuerySchema.parse({ latitude: "45.5", longitude: "-122.7" })).toEqual({
      latitude: 45.5,
      longitude: -122.7,
      units: "metric",
    });
    expect(
      weatherQuerySchema.parse({ latitude: "0", longitude: "180", units: "imperial" }).units
    ).toBe("imperial");
    for (const query of [
      { latitude: "91", longitude: "0" },
      { latitude: "0", longitude: "-181" },
      { latitude: "x", longitude: "0" },
      { latitude: "0", longitude: "0", units: "kelvin" },
    ]) {
      expect(weatherQuerySchema.safeParse(query).success).toBe(false);
    }
  });

  it("checks new calendar feeds", () => {
    expect(agendaFeedCreateSchema.parse({ url: " https://cal.lan/a.ics " })).toEqual({
      name: "",
      url: "https://cal.lan/a.ics",
    });
    expect(agendaFeedCreateSchema.safeParse({ url: "" }).success).toBe(false);
    expect(agendaFeedCreateSchema.safeParse({ url: "x", name: "y".repeat(61) }).success).toBe(
      false
    );
    expect(agendaFeedCreateSchema.safeParse({ url: "x", color: "red" }).success).toBe(false);
  });
});

describe("widget response schemas", () => {
  it("parse weather, places, feeds and events", () => {
    const report = {
      timezone: "UTC",
      current: {
        temperature: 1,
        apparentTemperature: 0,
        weatherCode: 3,
        isDay: true,
        windSpeed: 2,
        humidity: 50,
      },
      daily: [{ date: "2026-10-10", weatherCode: 3, max: 2, min: 0, precipitationChance: null }],
      units: { temperature: "°C", windSpeed: "km/h" },
      fetchedAt: 1,
    };
    expect(weatherReportSchema.parse(report)).toEqual(report);
    expect(weatherReportSchema.safeParse({ ...report, daily: [{}] }).success).toBe(false);

    const places = {
      results: [{ id: 1, name: "A", region: null, country: "B", latitude: 1, longitude: 2 }],
    };
    expect(geocodeResponseSchema.parse(places)).toEqual(places);

    const feed = { id: "f", name: "Work", host: "cal.lan" };
    expect(agendaFeedSchema.parse(feed)).toEqual(feed);
    expect(agendaFeedsResponseSchema.parse({ feeds: [feed] })).toEqual({ feeds: [feed] });

    const agenda = {
      events: [
        {
          id: "e",
          feedId: "f",
          title: "Standup",
          location: null,
          allDay: false,
          start: "2026-10-10T16:30:00.000Z",
          end: "2026-10-10T16:45:00.000Z",
        },
      ],
      errors: [{ feedId: "f", name: "Work", error: "HTTP 404" }],
    };
    expect(agendaResponseSchema.parse(agenda)).toEqual(agenda);
    expect(agendaResponseSchema.safeParse({ events: [{ id: "e" }], errors: [] }).success).toBe(
      false
    );
  });
});
