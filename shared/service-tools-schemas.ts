import { z } from "zod";

export const serviceInspectRequestSchema = z
  .object({ url: z.string().trim().min(1, "a URL is required").max(2000) })
  .strict();

export const serviceTestRequestSchema = z
  .object({
    url: z.string().trim().min(1, "a URL is required").max(2000),
    check_method: z.enum(["http", "tcp"]).default("http"),
    check_target: z.string().trim().max(2000).nullable().default(null),
    check_ignore_tls: z.boolean().default(false),
  })
  .strict();

export const serviceInspectionSchema = z.object({
  url: z.string(),
  reachable: z.boolean(),
  error: z.string().nullable(),
  name: z.string().nullable(),
  iconUrl: z.string().nullable(),
  selfSigned: z.boolean(),
});

export const serviceTestResultSchema = z.object({
  target: z.string(),
  state: z.enum(["up", "degraded", "down"]),
  latencyMs: z.number().nullable(),
  statusCode: z.number().nullable(),
  error: z.string().nullable(),
});
