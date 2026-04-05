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
