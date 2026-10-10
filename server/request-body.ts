import type { Context } from "hono";
import type { z } from "zod";
import { getValidationMessage } from "@shared/service-schemas";
import { jsonError } from "./api-response";

const JSON_CONTENT_TYPE_PATTERN = /^(application\/json|application\/[a-z0-9.+-]+\+json)(;|$)/i;

interface ParsedJsonBodyResult {
  data?: unknown;
  error?: string;
  status?: 400 | 415;
  success: boolean;
}

export function hasJsonContentType(contentType: string | null): boolean {
  return JSON_CONTENT_TYPE_PATTERN.test(contentType?.trim() ?? "");
}

export async function parseJsonBody(request: Request): Promise<ParsedJsonBodyResult> {
  const contentType = request.headers.get("content-type");
  if (!hasJsonContentType(contentType)) {
    return {
      success: false,
      status: 415,
      error: "content-type must be application/json",
    };
  }

  try {
    return {
      success: true,
      data: await request.json(),
    };
  } catch {
    return {
      success: false,
      status: 400,
      error: "request body must be valid JSON",
    };
  }
}

export type ValidatedJson<T> =
  { data: T; response?: undefined } | { data?: undefined; response: Response };

/**
 * Parses a JSON body and validates it, returning either the data or a ready-made error response
 * (415 for the wrong content type, 400 for bad JSON or the schema's first validation message).
 */
export async function readValidatedJson<T extends z.ZodType>(
  c: Context,
  schema: T
): Promise<ValidatedJson<z.infer<T>>> {
  const parsedBody = await parseJsonBody(c.req.raw);
  if (!parsedBody.success) {
    return {
      response: jsonError(c, parsedBody.status ?? 400, parsedBody.error ?? "invalid request body"),
    };
  }

  const result = schema.safeParse(parsedBody.data);
  if (!result.success) {
    return { response: jsonError(c, 400, getValidationMessage(result.error)) };
  }
  return { data: result.data };
}
