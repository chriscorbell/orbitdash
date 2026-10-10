import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ApiError,
  jsonBody,
  request,
  requestJson,
  setAuthChallengeHandler,
} from "@/lib/api/client";
import { TAB_ID } from "@/lib/tab-id";

const payloadSchema = z.object({
  name: z.string(),
});

describe("api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses JSON responses through the provided schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "Orbit" })))
    );

    await expect(requestJson("/api/test", {}, "Failed", payloadSchema)).resolves.toEqual({
      name: "Orbit",
    });
  });

  it("tags mutations with this tab's id so it can ignore its own change events", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await request("/api/test", { method: "POST", headers: { "X-Extra": "1" } }, "Failed");
    await request("/api/test", {}, "Failed");

    const [, postInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const postHeaders = new Headers(postInit.headers);
    expect(postHeaders.get("X-Orbitdash-Origin")).toBe(TAB_ID);
    expect(postHeaders.get("X-Extra")).toBe("1");

    const [, getInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(new Headers(getInit.headers).has("X-Orbitdash-Origin")).toBe(false);
  });

  it("builds JSON request bodies", () => {
    expect(jsonBody("PUT", { a: 1 })).toEqual({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: '{"a":1}',
    });
  });

  it("rejects invalid response shapes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: "Orbit" })))
    );

    await expect(requestJson("/api/test", {}, "Failed", payloadSchema)).rejects.toThrow();
  });
  it("throws an ApiError with the status, the server's message and any Retry-After", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "too many sign-in attempts" }), {
          status: 429,
          headers: { "Retry-After": "90" },
        })
      )
    );

    const error = await request("/api/auth/login", { method: "POST" }, "Failed").catch(
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: "too many sign-in attempts",
      retryAfterSeconds: 90,
      status: 429,
    });
  });

  it("falls back to the default message for bodies that aren't JSON errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 502 })));

    await expect(request("/api/test", {}, "Failed")).rejects.toMatchObject({
      message: "Failed",
      retryAfterSeconds: null,
      status: 502,
    });
  });

  it("passes the auth state of 401 and 403 replies to the challenge handler", async () => {
    const handler = vi.fn();
    setAuthChallengeHandler(handler);
    const auth = { mode: "password", canEdit: false };
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(reply(401, { error: "sign in required", auth }))
        .mockResolvedValueOnce(reply(403, { error: "sign in to make changes", auth }))
        .mockResolvedValueOnce(reply(401, { error: "incorrect password" }))
        .mockResolvedValueOnce(reply(404, { error: "not found", auth }))
    );

    for (let call = 0; call < 4; call += 1) {
      await request("/api/test", {}, "Failed").catch(() => {});
    }

    expect(handler.mock.calls).toEqual([[auth], [auth]]);
    setAuthChallengeHandler(null);
  });
});
