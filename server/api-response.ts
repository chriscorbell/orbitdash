import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ApiFailure = {
  error: string;
  status: ContentfulStatusCode;
  success: false;
};

export type ApiSuccess<TValue> = {
  success: true;
  value: TValue;
};

export type ApiResult<TValue> = ApiSuccess<TValue> | ApiFailure;

export function apiFail(status: ContentfulStatusCode, error: string): ApiFailure {
  return {
    error,
    status,
    success: false,
  };
}

export function apiOk<TValue>(value: TValue): ApiSuccess<TValue> {
  return {
    success: true,
    value,
  };
}

export function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage;
}

export function jsonError(c: Context, status: ContentfulStatusCode, error: string) {
  return c.json({ error }, status);
}

export function jsonNotFound(c: Context) {
  return jsonError(c, 404, "not found");
}

export function respondApiResult<TValue>(
  c: Context,
  result: ApiResult<TValue>,
  successStatus?: ContentfulStatusCode
) {
  if (!result.success) {
    return jsonError(c, result.status, result.error);
  }

  return successStatus === undefined ? c.json(result.value) : c.json(result.value, successStatus);
}
