import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { cleanupTestDatabase, setupTestDatabase } from "../test-utils";
import { createAgendaService, expandCalendar, normalizeFeedUrl } from "./agenda";

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
// Friday 2026-10-09 12:00 UTC
const NOW = Date.UTC(2026, 9, 9, 12);

function calendar(...events: string[]) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VTIMEZONE",
    "TZID:America/Los_Angeles",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0800",
    "TZOFFSETTO:-0700",
    "TZNAME:PDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0700",
    "TZOFFSETTO:-0800",
    "TZNAME:PST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

const event = (...lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");

const ICS = calendar(
  // Weekly standup, 9:30 Pacific on weekdays since 2024; one moved, one cancelled.
  event(
    "UID:standup",
    "SUMMARY:Standup",
    "DTSTART;TZID=America/Los_Angeles:20240101T093000",
    "DTEND;TZID=America/Los_Angeles:20240101T094500",
    "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
  ),
  event(
    "UID:standup",
    "RECURRENCE-ID;TZID=America/Los_Angeles:20261012T093000",
    "SUMMARY:Standup (moved)",
    "DTSTART;TZID=America/Los_Angeles:20261012T110000",
    "DTEND;TZID=America/Los_Angeles:20261012T111500"
  ),
  event(
    "UID:standup",
    "RECURRENCE-ID;TZID=America/Los_Angeles:20261013T093000",
    "STATUS:CANCELLED",
    "DTSTART;TZID=America/Los_Angeles:20261013T093000",
    "DTEND;TZID=America/Los_Angeles:20261013T094500"
  ),
  event(
    "UID:trip",
    "SUMMARY:Camping",
    "LOCATION: Mt Hood ",
    "DTSTART;VALUE=DATE:20261010",
    "DTEND;VALUE=DATE:20261012"
  ),
  event("UID:old", "SUMMARY:Long ago", "DTSTART:20200101T100000Z", "DTEND:20200101T110000Z"),
  event("UID:far", "SUMMARY:Next year", "DTSTART:20270101T100000Z"),
  event("UID:nameless", "DTSTART:20261009T200000Z", "DTEND:20261009T210000Z")
);

describe("expandCalendar", () => {
  it("expands recurring events in their time zone, with moved and cancelled instances", () => {
    const events = expandCalendar(ICS, "feed", NOW, NOW + 3 * DAY);
    const summary = events
      .map((item) => [item.title, item.start, item.allDay])
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])));

    expect(summary).toEqual([
      ["Standup", "2026-10-08T16:30:00.000Z", false],
      ["Standup", "2026-10-09T16:30:00.000Z", false],
      ["Busy", "2026-10-09T20:00:00.000Z", false],
      ["Camping", "2026-10-10", true],
      ["Standup (moved)", "2026-10-12T18:00:00.000Z", false],
    ]);
    const camping = events.find((item) => item.title === "Camping")!;
    expect(camping).toMatchObject({ location: "Mt Hood", end: "2026-10-12", feedId: "feed" });
    expect(new Set(events.map((item) => item.id)).size).toBe(events.length);
  });

  it("rejects files that aren't calendars", () => {
    expect(() => expandCalendar("hello", "f", NOW, NOW)).toThrow("That isn't a calendar file");
    expect(() => expandCalendar("BEGIN:VCARD\r\nVERSION:4.0\r\nEND:VCARD", "f", NOW, NOW)).toThrow(
      "That isn't a calendar file"
    );
  });
});

describe("normalizeFeedUrl", () => {
  it("accepts http(s) and webcal links", () => {
    expect(normalizeFeedUrl(" webcal://example.com/cal.ics ")).toBe("https://example.com/cal.ics");
    expect(normalizeFeedUrl("http://nas.lan/cal.ics")).toBe("http://nas.lan/cal.ics");
    expect(normalizeFeedUrl("ftp://x/cal.ics")).toBeNull();
    expect(normalizeFeedUrl("not a link")).toBeNull();
  });
});

describe("agenda service", () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = setupTestDatabase("orbitdash-agenda-");
  });
  afterEach(() => cleanupTestDatabase(dataDir));

  function setup(respond: (url: string) => Response | Promise<Response>) {
    const urls: string[] = [];
    let now = NOW;
    const service = createAgendaService({
      fetch: async (url) => {
        urls.push(url);
        return respond(url);
      },
      now: () => now,
    });
    return { service, urls, advance: (ms: number) => (now += ms) };
  }

  it("checks, saves, lists and removes feeds without exposing their links", async () => {
    const { service } = setup(() => new Response(ICS));
    const feed = await service.addFeed({
      name: " Work ",
      url: "webcal://cal.example.com/secret.ics",
    });
    expect(feed).toEqual({ id: expect.any(String), name: "Work", host: "cal.example.com" });
    const unnamed = await service.addFeed({ name: "", url: "https://other.example.com/x.ics" });
    expect(unnamed.name).toBe("other.example.com");
    expect(service.listFeeds()).toEqual([feed, unnamed]);
    expect(JSON.stringify(service.listFeeds())).not.toContain("secret");

    await expect(
      service.addFeed({ name: "Again", url: "https://cal.example.com/secret.ics" })
    ).rejects.toThrow("That calendar is already added");
    expect(service.removeFeed(feed.id)).toBe(true);
    expect(service.removeFeed(feed.id)).toBe(false);
    expect(service.listFeeds()).toEqual([unnamed]);
  });

  it("refuses links that don't serve a calendar", async () => {
    let answer: () => Response | Promise<Response> = () => new Response("nope", { status: 404 });
    const { service } = setup(() => answer());
    const add = () => service.addFeed({ name: "x", url: "https://cal.example.com/x.ics" });

    await expect(service.addFeed({ name: "x", url: "mailto:me" })).rejects.toThrow(
      "Use an http, https or webcal link"
    );
    await expect(add()).rejects.toThrow("The calendar answered HTTP 404");
    answer = () => Promise.reject(new Error("offline"));
    await expect(add()).rejects.toThrow("The calendar can't be reached");
    answer = () => new Response("<html>login</html>");
    await expect(add()).rejects.toThrow("That isn't a calendar file");
    answer = () => new Response("x", { headers: { "content-length": String(6 * 1024 * 1024) } });
    await expect(add()).rejects.toThrow("The calendar is too large");
    answer = () => new Response("x".repeat(5 * 1024 * 1024 + 1));
    await expect(add()).rejects.toThrow("The calendar is too large");
    expect(service.listFeeds()).toEqual([]);
  });

  it("limits how many feeds can be added", async () => {
    const { service } = setup(() => new Response(ICS));
    for (let index = 0; index < 10; index += 1) {
      await service.addFeed({ name: `${index}`, url: `https://cal.example.com/${index}.ics` });
    }
    await expect(
      service.addFeed({ name: "x", url: "https://cal.example.com/x.ics" })
    ).rejects.toThrow("Up to 10 calendars can be added");
  });

  it("merges feeds soonest first, caches them and reports the ones that fail", async () => {
    let failing = false;
    const { service, urls, advance } = setup((url) =>
      failing && url.includes("broken")
        ? new Response("gone", { status: 410 })
        : new Response(
            url.includes("broken")
              ? calendar(event("UID:x", "DTSTART:20261009T150000Z", "SUMMARY:Lunch"))
              : ICS
          )
    );
    await service.addFeed({ name: "Work", url: "https://cal.example.com/work.ics" });
    const broken = await service.addFeed({
      name: "Old",
      url: "https://cal.example.com/broken.ics",
    });
    failing = true;

    let result = await service.agenda(1);
    expect(result.events.map((item) => item.title)).toEqual([
      "Standup",
      "Lunch",
      "Standup",
      "Busy",
      "Camping",
    ]);
    expect(urls).toHaveLength(2);

    advance(15 * 60_000);
    service.resetForTesting();
    result = await service.agenda(1);
    expect(result.errors).toEqual([
      { feedId: broken.id, name: "Old", error: "The calendar answered HTTP 410" },
    ]);
    expect(result.events.map((item) => item.title)).not.toContain("Lunch");
  });

  it("reads past corrupt stored feeds", async () => {
    const { getDb } = await import("../db");
    const { service } = setup(() => new Response(ICS));
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES ('widgets.agenda.feeds', '{oops')")
      .run();
    expect(service.listFeeds()).toEqual([]);
    getDb()
      .prepare("UPDATE settings SET value = ? WHERE key = 'widgets.agenda.feeds'")
      .run(JSON.stringify([{ id: 1 }, "x", { id: "a", name: "A", url: "https://a.lan/c.ics" }]));
    expect(service.listFeeds()).toEqual([{ id: "a", name: "A", host: "a.lan" }]);
    getDb().prepare("UPDATE settings SET value = '{}' WHERE key = 'widgets.agenda.feeds'").run();
    expect(service.listFeeds()).toEqual([]);
  });
});
