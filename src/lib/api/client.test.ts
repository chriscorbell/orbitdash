import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { jsonBody, request, requestJson } from "@/lib/api/client";
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
});
