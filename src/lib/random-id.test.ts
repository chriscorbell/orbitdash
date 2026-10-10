import { afterEach, describe, expect, it, vi } from "vitest";
import { randomId } from "@/lib/random-id";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("randomId", () => {
  it("uses crypto.randomUUID where the browser has it", () => {
    expect(randomId()).toMatch(UUID_V4);
  });

  it("builds a v4 UUID itself on plain http, where randomUUID is missing", () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });

    const first = randomId();
    expect(first).toMatch(UUID_V4);
    expect(randomId()).not.toBe(first);
  });
});
