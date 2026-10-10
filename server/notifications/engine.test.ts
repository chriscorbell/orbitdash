import { describe, expect, it } from "bun:test";
import { DEFAULT_NOTIFICATION_OPTIONS } from "@shared/notifications";
import type { NotificationOptions } from "@shared/types";
import { createNotificationEngine } from "./engine";
import type { NotificationMessage, SummaryItem } from "./messages";
import type { StoredIncident } from "./store";
import { alert, status } from "./test-fixtures";

const MIN = 60_000;
const DAY_START = Date.UTC(2026, 9, 10, 0, 0);

/** An engine with a settable clock and options, recording what it sends and stores. */
function setup(overrides: Partial<NotificationOptions> = {}, stored: StoredIncident[] = []) {
  const state = {
    now: DAY_START + 12 * 60 * MIN,
    options: { ...DEFAULT_NOTIFICATION_OPTIONS, timeZone: "UTC", ...overrides },
    services: new Map<string, { name: string; url: string; externalUrl: string | null }>([
      ["svc", { name: "Jellyfin", url: "http://jf.lan/", externalUrl: null }],
    ]),
  };
  const sent: NotificationMessage[] = [];
  const summaries: SummaryItem[][] = [];
  const incidents = new Map<string, StoredIncident>(stored.map((i) => [i.serviceId, i]));
  const engine = createNotificationEngine(
    {
      now: () => state.now,
      readOptions: () => state.options,
      lookupService: (id) => state.services.get(id) ?? null,
      saveIncident: (incident) =>
        incidents.set(incident.serviceId, {
          serviceId: incident.serviceId,
          startedAt: incident.startedAt,
          notifiedAt: incident.notifiedAt,
        }),
      deleteIncident: (id) => incidents.delete(id),
      send: (message) => sent.push(message),
      sendSummary: (items) => summaries.push(items),
    },
    stored
  );
  const advance = (ms: number) => {
    state.now += ms;
    return state.now;
  };
  return { engine, state, sent, summaries, incidents, advance };
}

const quietNight = { enabled: true, start: "22:00", end: "07:00" };

describe("service status notifications", () => {
  it("says a service is down once it has been down for the delay, once per incident", () => {
    const { engine, sent, incidents, advance, state } = setup({ downDelayMinutes: 2 });
    const since = state.now;
    engine.status("svc", status("down", since));
    expect(sent).toHaveLength(0);
    expect(incidents.get("svc")).toEqual({ serviceId: "svc", startedAt: since, notifiedAt: null });

    advance(MIN);
    engine.status("svc", status("down", since, "HTTP 503"));
    engine.tick();
    expect(sent).toHaveLength(0);

    advance(MIN);
    engine.tick();
    expect(sent.map((message) => [message.event, message.title, message.body])).toEqual([
      ["service.down", "Jellyfin is down", "HTTP 503. Down since 12:00."],
    ]);
    expect(incidents.get("svc")?.notifiedAt).toBe(state.now);

    // More failed checks, more ticks: still one message.
    advance(MIN);
    engine.status("svc", status("down", since));
    engine.tick();
    expect(sent).toHaveLength(1);

    advance(5 * MIN);
    engine.status("svc", status("up", state.now));
    expect(sent.map((message) => [message.event, message.body])).toEqual([
      ["service.down", "HTTP 503. Down since 12:00."],
      ["service.recovered", "Down for 8 min, from 12:00 to 12:08."],
    ]);
    expect(incidents.size).toBe(0);
  });

  it("stays silent about outages shorter than the delay", () => {
    const { engine, sent, incidents, advance, state } = setup({ downDelayMinutes: 5 });
    engine.status("svc", status("down", state.now));
    advance(3 * MIN);
    engine.tick();
    engine.status("svc", status("degraded", state.now));
    advance(5 * MIN);
    engine.tick();
    expect(sent).toHaveLength(0);
    expect(incidents.size).toBe(0);
  });

  it("sends right away without a delay, and ignores up and slow without an incident", () => {
    const { engine, sent, state } = setup({ downDelayMinutes: 0 });
    engine.status("svc", status("up", state.now));
    engine.status("svc", status("degraded", state.now));
    engine.status("svc", status("down", null));
    expect(sent.map((message) => message.event)).toEqual(["service.down"]);
    expect(sent[0].service?.downSince).toBe(state.now);
  });

  it("drops incidents quietly when checks stop or the service is gone", () => {
    const { engine, sent, incidents, state, advance } = setup({ downDelayMinutes: 0 });
    engine.status("svc", status("down", state.now));
    engine.status("svc", null);
    expect(incidents.size).toBe(0);

    engine.status("svc", status("down", state.now));
    engine.status("svc", status("unknown", null));
    expect(incidents.size).toBe(0);
    engine.status("svc", null);

    // A service deleted before its delay ran out: nothing to name, nothing sent.
    state.options = { ...state.options, downDelayMinutes: 1 };
    engine.status("svc", status("down", state.now));
    state.services.clear();
    advance(2 * MIN);
    engine.tick();
    engine.status("svc", status("up", state.now));
    expect(sent.map((message) => message.event)).toEqual(["service.down", "service.down"]);
  });

  it("picks up incidents from before a restart without repeating them", () => {
    const now = DAY_START + 12 * 60 * MIN;
    const { engine, sent } = setup({ downDelayMinutes: 2 }, [
      { serviceId: "svc", startedAt: now - 10 * MIN, notifiedAt: now - 8 * MIN },
      { serviceId: "other", startedAt: now - 10 * MIN, notifiedAt: null },
    ]);
    engine.status("svc", status("down", now - 10 * MIN));
    engine.tick();
    expect(sent).toHaveLength(0);

    engine.status("svc", status("up", now));
    expect(sent.map((message) => message.event)).toEqual(["service.recovered"]);
  });
});

describe("alert notifications", () => {
  it("announces firing alerts and their resolution", () => {
    const { engine, sent } = setup();
    engine.alert(alert());
    engine.alert(alert({ value: 40, resolvedAt: 600_000 }));
    expect(sent.map((message) => message.event)).toEqual(["alert.firing", "alert.resolved"]);
  });

  it("ignores resolutions of alerts it never announced", () => {
    const { engine, sent } = setup();
    engine.alert(alert({ resolvedAt: 5 }));
    expect(sent).toHaveLength(0);
  });
});

describe("quiet hours", () => {
  it("holds everything and sends one summary when they end", () => {
    const { engine, sent, summaries, incidents, state, advance } = setup({
      downDelayMinutes: 2,
      quietHours: quietNight,
    });
    state.now = DAY_START + 23 * 60 * MIN; // 23:00 UTC

    // Down past the delay and still down at the end.
    engine.status("svc", status("down", state.now));
    // A second service that goes down and comes back during the night.
    state.services.set("plex", { name: "Plex", url: "http://plex.lan/", externalUrl: null });
    engine.status("plex", { ...status("down", state.now), id: "plex" });
    advance(3 * MIN);
    engine.tick();
    engine.status("svc", status("down", state.now - 3 * MIN, "HTTP 502"));
    engine.status("plex", { ...status("up", state.now), id: "plex" });
    // An alert that fires and resolves, and one still firing.
    engine.alert(alert({ id: "cpu" }));
    engine.alert(alert({ id: "cpu", value: 40, resolvedAt: state.now }));
    engine.alert(alert({ id: "mem", metric: "memory" }));
    expect(sent).toHaveLength(0);

    state.now = DAY_START + 31 * 60 * MIN; // 07:00 the next day
    engine.tick();
    expect(sent).toHaveLength(0);
    expect(summaries).toHaveLength(1);
    expect(
      summaries[0].map((item) =>
        item.kind === "status"
          ? [item.service.name, item.endedAt === null ? "down" : "recovered", item.error]
          : [item.alert.id, item.alert.resolvedAt === null ? "firing" : "resolved"]
      )
    ).toEqual([
      ["Jellyfin", "down", "HTTP 502"],
      ["Plex", "recovered", "Connection refused"],
      ["cpu", "resolved"],
      ["mem", "firing"],
    ]);
    // Announced by the summary: its recovery and the alert's resolution come normally.
    expect(incidents.get("svc")?.notifiedAt).toBe(state.now);
    engine.tick();
    expect(summaries).toHaveLength(1);
    engine.status("svc", status("up", state.now));
    engine.alert(alert({ id: "mem", metric: "memory", resolvedAt: state.now }));
    expect(sent.map((message) => message.event)).toEqual(["service.recovered", "alert.resolved"]);
  });

  it("holds recoveries of incidents announced before quiet hours", () => {
    const { engine, sent, summaries, state } = setup({
      downDelayMinutes: 0,
      quietHours: quietNight,
    });
    state.now = DAY_START + 21 * 60 * MIN;
    engine.status("svc", status("down", state.now));
    engine.alert(alert());
    expect(sent).toHaveLength(2);

    state.now = DAY_START + 23 * 60 * MIN;
    engine.status("svc", status("up", state.now));
    engine.alert(alert({ resolvedAt: state.now }));
    expect(sent).toHaveLength(2);

    state.now = DAY_START + 31 * 60 * MIN;
    engine.tick();
    expect(summaries[0].map((item) => item.kind)).toEqual(["status", "alerts"]);
  });

  it("keeps an alert in the summary when it resolves between the end and the next tick", () => {
    const { engine, sent, summaries, state } = setup({ quietHours: quietNight });
    state.now = DAY_START + 23 * 60 * MIN;
    engine.alert(alert());
    state.now = DAY_START + 31 * 60 * MIN;
    engine.alert(alert({ resolvedAt: state.now }));
    engine.tick();
    expect(sent).toHaveLength(0);
    expect(summaries[0]).toEqual([{ kind: "alerts", alert: alert({ resolvedAt: state.now }) }]);
  });

  it("forgets a held outage when its check is turned off", () => {
    const { engine, summaries, state, advance } = setup({
      downDelayMinutes: 0,
      quietHours: quietNight,
    });
    state.now = DAY_START + 23 * 60 * MIN;
    engine.status("svc", status("down", state.now));
    expect(engine.inspect().held).toHaveLength(1);
    engine.status("svc", null);
    expect(engine.inspect()).toEqual({ incidents: [], held: [] });
    advance(9 * 60 * MIN);
    engine.tick();
    expect(summaries).toHaveLength(0);
  });

  it("sends the summary as soon as quiet hours are switched off", () => {
    const { engine, summaries, state } = setup({ quietHours: quietNight });
    state.now = DAY_START + 23 * 60 * MIN;
    engine.alert(alert());
    state.options = { ...state.options, quietHours: { ...quietNight, enabled: false } };
    engine.tick();
    expect(summaries).toHaveLength(1);
  });
});
