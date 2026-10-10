import { describe, expect, it } from "bun:test";
import {
  alertFiringMessage,
  alertResolvedMessage,
  formatTime,
  serviceDownMessage,
  serviceRecoveredMessage,
  summaryMessage,
  testMessage,
  type SummaryItem,
} from "./messages";
import { alert } from "./test-fixtures";

const NOW = Date.UTC(2026, 9, 10, 14, 30);
const ctx = { now: NOW, timeZone: "UTC" };
const at = (hours: number, minutes: number) => Date.UTC(2026, 9, 10, hours, minutes);
const service = { id: "svc", name: "Jellyfin", url: "http://10.0.0.20:8096/" };

describe("formatTime", () => {
  it("writes a clock time today and adds the date before that", () => {
    expect(formatTime(at(14, 2), ctx)).toBe("14:02");
    expect(formatTime(Date.UTC(2026, 9, 9, 23, 5), ctx)).toBe("Oct 9 23:05");
    // 23:05 UTC on the 9th is already the 10th in Tokyo.
    expect(formatTime(Date.UTC(2026, 9, 9, 23, 5), { ...ctx, timeZone: "Asia/Tokyo" })).toBe(
      "08:05"
    );
    expect(formatTime(NOW, { now: NOW, timeZone: null })).toMatch(/^(\w+ \d+ )?\d\d:\d\d$/);
  });
});

describe("messages", () => {
  it("says a service is down, with the reason and since when", () => {
    expect(serviceDownMessage(service, at(14, 2), "Connection refused", ctx)).toMatchObject({
      event: "service.down",
      kind: "status",
      severity: "critical",
      title: "Jellyfin is down",
      body: "Connection refused. Down since 14:02.",
      url: service.url,
      service: { ...service, error: "Connection refused", downSince: at(14, 2), upAt: null },
    });
    expect(serviceDownMessage(service, at(14, 2), null, ctx).body).toBe("Down since 14:02.");
  });

  it("says a service is back, with how long it was down", () => {
    expect(serviceRecoveredMessage(service, at(14, 2), at(14, 14), ctx)).toMatchObject({
      event: "service.recovered",
      severity: "resolved",
      title: "Jellyfin is back up",
      body: "Down for 12 min, from 14:02 to 14:14.",
      service: { downSince: at(14, 2), upAt: at(14, 14) },
    });
  });

  it("describes firing and resolved alerts", () => {
    const firing = alert({ startedAt: at(14, 0), firedAt: at(14, 5) });
    expect(alertFiringMessage(firing, ctx)).toMatchObject({
      event: "alert.firing",
      kind: "alerts",
      severity: "warning",
      title: "CPU above 90% for 5 min",
      body: "Now 97%, peak 98%. Since 14:00.",
      alert: firing,
    });

    const resolved = { ...firing, value: 50, resolvedAt: at(14, 12) };
    expect(alertResolvedMessage(resolved, ctx)).toMatchObject({
      event: "alert.resolved",
      severity: "resolved",
      title: "CPU back below 90%",
      body: "Peak 98%. Lasted 12 min, from 14:00 to 14:12.",
    });

    // Resolved by a rule change, or an unmounted disk, with the value still high.
    const cleared = alert({
      metric: "disk",
      subject: "/srv",
      threshold: 85,
      value: 90,
      peak: 91,
      startedAt: at(14, 0),
      resolvedAt: null,
    });
    expect(alertResolvedMessage(cleared, ctx)).toMatchObject({
      title: "Disk (/srv) alert cleared",
      body: "Peak 91%. Lasted 30 min, from 14:00 to 14:30.",
    });
  });

  it("writes a test message from the dashboard", () => {
    expect(testMessage("Homelab", ctx)).toMatchObject({
      event: "test",
      kind: null,
      severity: "info",
      title: "Test notification",
      body: "Homelab can reach you here.",
    });
  });
});

describe("summaryMessage", () => {
  const items: SummaryItem[] = [
    {
      kind: "status",
      service: { ...service, name: "Plex" },
      startedAt: at(2, 13),
      endedAt: at(2, 40),
      error: "HTTP 502",
    },
    { kind: "status", service, startedAt: at(3, 0), endedAt: null, error: "Connection refused" },
    { kind: "alerts", alert: alert({ startedAt: at(3, 0), resolvedAt: at(3, 12) }) },
    { kind: "alerts", alert: alert({ id: "a2", metric: "memory", startedAt: at(4, 0) }) },
  ];

  it("lists what is still wrong first, then what passed", () => {
    const message = summaryMessage(items, ctx);
    expect(message).toMatchObject({
      event: "summary",
      kind: null,
      severity: "critical",
      title: "During quiet hours: 4 updates",
    });
    expect(message.body.split("\n")).toEqual([
      "Jellyfin is still down, since 03:00. Connection refused.",
      "Memory above 90% for 5 min: still firing, since 04:00 (peak 98%).",
      "Plex was down 02:13 to 02:40 (27 min).",
      "CPU above 90% for 5 min: 03:00 to 03:12 (peak 98%).",
    ]);
    expect(message.items.map((item) => item.event)).toEqual([
      "service.down",
      "alert.firing",
      "service.recovered",
      "alert.resolved",
    ]);
  });

  it("takes its severity from what is still going on", () => {
    expect(summaryMessage([items[3]], ctx)).toMatchObject({
      severity: "warning",
      title: "During quiet hours",
    });
    expect(summaryMessage([items[0], items[2]], ctx).severity).toBe("resolved");
  });

  it("caps long summaries", () => {
    const many: SummaryItem[] = Array.from({ length: 23 }, (_, index) => ({
      kind: "alerts",
      alert: alert({ id: `a${index}`, startedAt: at(3, 0), resolvedAt: at(3, 5) }),
    }));
    const lines = summaryMessage(many, ctx).body.split("\n");
    expect(lines).toHaveLength(21);
    expect(lines.at(-1)).toBe("And 3 more.");
  });
});
