import { z } from "zod";

export const weatherQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  units: z.enum(["metric", "imperial"]).default("metric"),
});

export const agendaFeedCreateSchema = z
  .object({
    name: z.string().trim().max(60, "name must be 60 characters or fewer").default(""),
    url: z.string().trim().min(1, "a calendar link is required").max(2000),
  })
  .strict();

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
      precipitationChance: z.number().nullable(),
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
      region: z.string().nullable(),
      country: z.string().nullable(),
      latitude: z.number(),
      longitude: z.number(),
    })
  ),
});

const agendaFeedSchema = z.object({ id: z.string(), name: z.string(), host: z.string() });

export const agendaFeedsResponseSchema = z.object({ feeds: z.array(agendaFeedSchema) });

export const agendaResponseSchema = z.object({
  events: z.array(
    z.object({
      id: z.string(),
      feedId: z.string(),
      title: z.string(),
      location: z.string().nullable(),
      allDay: z.boolean(),
      start: z.string(),
      end: z.string(),
    })
  ),
  errors: z.array(z.object({ feedId: z.string(), name: z.string(), error: z.string() })),
});

export { agendaFeedSchema };
