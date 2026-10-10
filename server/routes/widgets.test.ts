import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { app } from "../app";
import { initializeServer, shutdown } from "../runtime";
import { cleanupTestDatabase, setupTestDatabase } from "../test-utils";
import { AgendaFeedError, agendaService } from "../widgets/agenda";
import { WeatherUnavailableError, weatherService } from "../widgets/weather";

let dataDir: string;
const restores: Array<{ mockRestore: () => void }> = [];

beforeEach(() => {
  dataDir = setupTestDatabase("orbitdash-widgets-");
  initializeServer({
    dataDir,
    logStartup: false,
    registerSignalHandlers: false,
    startJobs: false,
    startMetrics: false,
  });
});

afterEach(() => {
  for (const spy of restores.splice(0)) spy.mockRestore();
  shutdown();
  cleanupTestDatabase(dataDir);
});

function spy<T extends object, K extends keyof T>(target: T, key: K) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mock = spyOn(target, key as any);
  restores.push(mock);
  return mock;
}

describe("weather routes", () => {
  it("passes coordinates and units through", async () => {
    const forecast = spy(weatherService, "forecast").mockResolvedValue({
      timezone: "UTC",
    } as never);
    const response = await app.request(
      "/api/widgets/weather?latitude=45.5&longitude=-122.7&units=imperial"
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ timezone: "UTC" });
    expect(forecast).toHaveBeenCalledWith(45.5, -122.7, "imperial");

    await app.request("/api/widgets/weather?latitude=1&longitude=2");
    expect(forecast).toHaveBeenLastCalledWith(1, 2, "metric");
  });

  it("checks coordinates and reports outages", async () => {
    spy(weatherService, "forecast").mockRejectedValue(new WeatherUnavailableError("down"));
    expect((await app.request("/api/widgets/weather?latitude=91&longitude=0")).status).toBe(400);
    expect((await app.request("/api/widgets/weather")).status).toBe(400);
    const response = await app.request("/api/widgets/weather?latitude=1&longitude=2");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Weather is unavailable right now" });
  });

  it("searches places", async () => {
    const geocode = spy(weatherService, "geocode").mockResolvedValue([]);
    expect(await (await app.request("/api/widgets/geocode?q=Berlin")).json()).toEqual({
      results: [],
    });
    expect(geocode).toHaveBeenCalledWith("Berlin");
    await app.request("/api/widgets/geocode");
    expect(geocode).toHaveBeenLastCalledWith("");

    geocode.mockRejectedValue(new Error("offline"));
    expect((await app.request("/api/widgets/geocode?q=x")).status).toBe(503);
  });
});

describe("agenda routes", () => {
  const feed = { id: "f1", name: "Work", host: "cal.example.com" };

  it("returns upcoming events for an allowed number of days", async () => {
    const agenda = spy(agendaService, "agenda").mockResolvedValue({ events: [], errors: [] });
    expect(await (await app.request("/api/widgets/agenda?days=14")).json()).toEqual({
      events: [],
      errors: [],
    });
    expect(agenda).toHaveBeenCalledWith(14);
    await app.request("/api/widgets/agenda?days=999");
    expect(agenda).toHaveBeenLastCalledWith(7);
  });

  it("lists, adds and removes feeds", async () => {
    spy(agendaService, "listFeeds").mockReturnValue([feed]);
    const addFeed = spy(agendaService, "addFeed").mockResolvedValue(feed);
    const removeFeed = spy(agendaService, "removeFeed").mockReturnValue(true);

    expect(await (await app.request("/api/widgets/agenda/feeds")).json()).toEqual({
      feeds: [feed],
    });

    const created = await app.request("/api/widgets/agenda/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Work", url: "webcal://cal.example.com/a.ics" }),
    });
    expect(created.status).toBe(201);
    expect(addFeed).toHaveBeenCalledWith({ name: "Work", url: "webcal://cal.example.com/a.ics" });

    expect((await app.request("/api/widgets/agenda/feeds/f1", { method: "DELETE" })).status).toBe(
      200
    );
    expect(removeFeed).toHaveBeenCalledWith("f1");
    removeFeed.mockReturnValue(false);
    expect((await app.request("/api/widgets/agenda/feeds/f1", { method: "DELETE" })).status).toBe(
      404
    );
  });

  it("explains feeds it can't add", async () => {
    const addFeed = spy(agendaService, "addFeed").mockRejectedValue(
      new AgendaFeedError("The calendar answered HTTP 404")
    );
    const post = (body: unknown) =>
      app.request("/api/widgets/agenda/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const response = await post({ url: "https://cal.example.com/a.ics" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The calendar answered HTTP 404" });
    expect((await post({ name: "x" })).status).toBe(400);
    expect((await post({ url: "x", extra: 1 })).status).toBe(400);

    addFeed.mockRejectedValue(new Error("boom"));
    expect((await post({ url: "https://cal.example.com/a.ics" })).status).toBe(500);
  });
});
