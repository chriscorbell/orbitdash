import ICAL from "ical.js";
import type { AgendaEvent, AgendaFeed, AgendaResponse } from "@shared/types";
import { getDb } from "../db";
import { randomUUID } from "crypto";

const FEEDS_KEY = "widgets.agenda.feeds";
export const MAX_FEEDS = 10;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const FEED_TTL_MS = 15 * 60_000;
const MAX_EVENTS = 200;
// Daily events since years ago still expand quickly; anything beyond this is cut off.
const MAX_OCCURRENCES_PER_EVENT = 5_000;
const DAY_MS = 24 * 60 * 60_000;

export class AgendaFeedError extends Error {}

interface StoredFeed {
  id: string;
  name: string;
  url: string;
}

export interface AgendaDependencies {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  now: () => number;
}

const defaultDependencies: AgendaDependencies = {
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** webcal:// is how calendar apps share feeds; it is plain https underneath. */
export function normalizeFeedUrl(input: string): string | null {
  const raw = input.trim().replace(/^webcals?:\/\//i, "https://");
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function readFeeds(): StoredFeed[] {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(FEEDS_KEY) as
    { value: string } | undefined;
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (feed): feed is StoredFeed =>
            isRecord(feed) &&
            typeof feed.id === "string" &&
            typeof feed.name === "string" &&
            typeof feed.url === "string"
        )
      : [];
  } catch {
    return [];
  }
}

function writeFeeds(feeds: StoredFeed[]) {
  getDb()
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run(FEEDS_KEY, JSON.stringify(feeds));
}

const publicFeed = (feed: StoredFeed): AgendaFeed => ({
  id: feed.id,
  name: feed.name,
  host: new URL(feed.url).host,
});

/** "2026-10-10" for an all-day date, an ISO timestamp otherwise. */
function formatTime(time: ICAL.Time): string {
  if (time.isDate) {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${time.year}-${pad(time.month)}-${pad(time.day)}`;
  }
  return time.toJSDate().toISOString();
}

/**
 * Event occurrences from an iCalendar document that overlap the window, recurring events
 * expanded and their moved or cancelled instances applied.
 */
export function expandCalendar(
  ics: string,
  feedId: string,
  windowStart: number,
  windowEnd: number
): AgendaEvent[] {
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(ics));
  } catch {
    throw new AgendaFeedError("That isn't a calendar file");
  }
  if (root.name !== "vcalendar") throw new AgendaFeedError("That isn't a calendar file");

  for (const zone of root.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(zone);
    } catch {
      // A broken time zone falls back to floating times for the events that use it.
    }
  }

  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const component of root.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(component);
    if (!event.startDate) continue;
    if (event.isRecurrenceException()) exceptions.push(event);
    else masters.set(event.uid || `${masters.size}`, event);
  }
  for (const exception of exceptions) {
    const master = masters.get(exception.uid);
    if (master) master.relateException(exception);
  }

  // All-day dates have no time zone; compare them a day wide on each side and let the browser,
  // which knows the local date, make the final cut.
  const startMs = windowStart - DAY_MS;
  const endMs = windowEnd + DAY_MS;
  const events: AgendaEvent[] = [];

  const add = (event: ICAL.Event, start: ICAL.Time, end: ICAL.Time | null, key: string) => {
    const startAt = start.toJSDate().getTime();
    const endTime = end ?? start;
    const endAt = endTime.toJSDate().getTime();
    if (endAt < startMs || startAt > endMs) return;
    if (event.component.getFirstPropertyValue("status") === "CANCELLED") return;
    events.push({
      id: `${feedId}:${event.uid}:${key}`,
      feedId,
      title: event.summary?.trim() || "Busy",
      location: event.location?.trim() || null,
      allDay: start.isDate,
      start: formatTime(start),
      end: formatTime(endTime),
    });
  };

  for (const event of masters.values()) {
    if (!event.isRecurring()) {
      add(event, event.startDate, event.endDate, formatTime(event.startDate));
      continue;
    }
    const iterator = event.iterator();
    for (let count = 0; count < MAX_OCCURRENCES_PER_EVENT; count += 1) {
      const next = iterator.next();
      if (!next || next.toJSDate().getTime() > endMs) break;
      const details = event.getOccurrenceDetails(next);
      add(details.item, details.startDate, details.endDate, formatTime(next));
    }
  }
  return events;
}

/** Calendar feeds kept on the server (their URLs are secrets) and the events they hold. */
export function createAgendaService(deps: AgendaDependencies = defaultDependencies) {
  const cache = new Map<string, { at: number; ics: Promise<string> }>();

  async function download(url: string): Promise<string> {
    let response: Response;
    try {
      response = await deps.fetch(url, {
        headers: { Accept: "text/calendar, */*" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new AgendaFeedError("The calendar can't be reached");
    }
    if (!response.ok) throw new AgendaFeedError(`The calendar answered HTTP ${response.status}`);
    if (Number(response.headers.get("content-length") ?? 0) > MAX_FEED_BYTES) {
      throw new AgendaFeedError("The calendar is too large");
    }
    const text = await response.text();
    if (text.length > MAX_FEED_BYTES) throw new AgendaFeedError("The calendar is too large");
    return text;
  }

  function feedText(feed: StoredFeed): Promise<string> {
    const hit = cache.get(feed.id);
    if (hit && deps.now() - hit.at < FEED_TTL_MS) return hit.ics;
    const ics = download(feed.url);
    cache.set(feed.id, { at: deps.now(), ics });
    ics.catch(() => cache.delete(feed.id));
    return ics;
  }

  return {
    listFeeds(): AgendaFeed[] {
      return readFeeds().map(publicFeed);
    },

    /** Checks that the URL serves a calendar before saving it. */
    async addFeed(input: { name: string; url: string }): Promise<AgendaFeed> {
      const url = normalizeFeedUrl(input.url);
      if (!url) throw new AgendaFeedError("Use an http, https or webcal link");
      const feeds = readFeeds();
      if (feeds.length >= MAX_FEEDS) {
        throw new AgendaFeedError(`Up to ${MAX_FEEDS} calendars can be added`);
      }
      if (feeds.some((feed) => feed.url === url)) {
        throw new AgendaFeedError("That calendar is already added");
      }
      const ics = await download(url);
      expandCalendar(ics, "check", deps.now(), deps.now());

      const feed: StoredFeed = {
        id: randomUUID(),
        name: input.name.trim() || new URL(url).host,
        url,
      };
      writeFeeds([...feeds, feed]);
      cache.set(feed.id, { at: deps.now(), ics: Promise.resolve(ics) });
      return publicFeed(feed);
    },

    removeFeed(id: string): boolean {
      const feeds = readFeeds();
      const next = feeds.filter((feed) => feed.id !== id);
      if (next.length === feeds.length) return false;
      writeFeeds(next);
      cache.delete(id);
      return true;
    },

    /** Upcoming events across every feed, soonest first; a failing feed is reported, not fatal. */
    async agenda(days: number): Promise<AgendaResponse> {
      const now = deps.now();
      const results = await Promise.all(
        readFeeds().map(async (feed) => {
          try {
            return {
              events: expandCalendar(await feedText(feed), feed.id, now, now + days * DAY_MS),
            };
          } catch (error) {
            const message =
              error instanceof AgendaFeedError ? error.message : "The calendar couldn't be read";
            return { error: { feedId: feed.id, name: feed.name, error: message } };
          }
        })
      );
      const events = results
        .flatMap((result) => result.events ?? [])
        .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
        .slice(0, MAX_EVENTS);
      return { events, errors: results.flatMap((result) => (result.error ? [result.error] : [])) };
    },

    resetForTesting() {
      cache.clear();
    },
  };
}

export const agendaService = createAgendaService();
