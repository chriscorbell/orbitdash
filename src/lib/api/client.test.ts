import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { invalidateRequestCache, requestJson, requestJsonCached } from "@/lib/api/client";

const payloadSchema = z.object({
  name: z.string(),
});

describe("api client", () => {
  beforeEach(() => {
    invalidateRequestCache("/api/test");
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

  it("caches parsed GET responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "Orbit" })));

    vi.stubGlobal("fetch", fetchMock);

    await expect(requestJsonCached("/api/test", {}, "Failed", payloadSchema)).resolves.toEqual({
      name: "Orbit",
    });
    await expect(requestJsonCached("/api/test", {}, "Failed", payloadSchema)).resolves.toEqual({
      name: "Orbit",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid response shapes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: "Orbit" })))
    );

    await expect(requestJson("/api/test", {}, "Failed", payloadSchema)).rejects.toThrow();
  });
});
