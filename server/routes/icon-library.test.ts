import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { app } from "../app";
import { iconLibrary } from "../services/icon-library";

afterEach(() => {
  iconLibrary.resetForTesting();
});

describe("GET /api/icon-library", () => {
  it("passes the query and a clamped limit through", async () => {
    const search = spyOn(iconLibrary, "search").mockResolvedValue({ entries: [], updatedAt: 5 });

    const response = await app.request("/api/icon-library?q=plex&limit=500");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entries: [], updatedAt: 5 });
    expect(search).toHaveBeenCalledWith("plex", 60);

    await app.request("/api/icon-library");
    expect(search).toHaveBeenLastCalledWith("", 48);
    search.mockRestore();
  });

  it("reports the library as unavailable when it can't load", async () => {
    const search = spyOn(iconLibrary, "search").mockRejectedValue(new Error("offline"));
    const response = await app.request("/api/icon-library?q=plex");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "The icon library is unavailable right now",
    });
    search.mockRestore();
  });
});
