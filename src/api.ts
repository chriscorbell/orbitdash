import type { Board, IconMatch, Layout, Link } from "../shared/types.ts";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError("The server can't be reached.", 0);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `The server answered ${response.status}.`;
    throw new ApiError(message, response.status);
  }
  return body as T;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const api = {
  board: () => request<Board>("/api/board"),
  createLink: (form: FormData) => request<Board>("/api/links", { method: "POST", body: form }),
  updateLink: (id: string, form: FormData) =>
    request<Board>(`/api/links/${encodeURIComponent(id)}`, { method: "PATCH", body: form }),
  deleteLink: (id: string) =>
    request<Board>(`/api/links/${encodeURIComponent(id)}`, { method: "DELETE" }),
  createCategory: (name: string) => request<Board>("/api/categories", json("POST", { name })),
  renameCategory: (id: string, name: string) =>
    request<Board>(`/api/categories/${encodeURIComponent(id)}`, json("PATCH", { name })),
  deleteCategory: (id: string) =>
    request<Board>(`/api/categories/${encodeURIComponent(id)}`, { method: "DELETE" }),
  arrange: (layout: Layout) => request<Board>("/api/layout", json("PUT", layout)),
  searchIcons: (query: string, signal: AbortSignal) =>
    request<IconMatch[]>(`/api/icon-library?q=${encodeURIComponent(query)}`, { signal }),
};

export function iconUrl(name: string): string {
  return `/api/icons/${encodeURIComponent(name)}`;
}

export function linkIconSrc(link: Link): string | null {
  return link.icon ? iconUrl(link.icon) : null;
}
