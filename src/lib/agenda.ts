import type { AgendaEvent } from "@shared/types";

export interface AgendaItem {
  event: AgendaEvent;
  /** "All day", "Now", or the start time. */
  when: string;
}

export interface AgendaDay {
  key: string;
  label: string;
  items: AgendaItem[];
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The local calendar date of a moment, as "2026-10-10". */
export function localDateKey(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  return localDateKey(new Date(year, month - 1, day + days, 12).getTime());
}

function dayLabel(key: string, todayKey: string, locale?: string): string {
  if (key === todayKey) return "Today";
  if (key === addDays(todayKey, 1)) return "Tomorrow";
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

/**
 * Events still to come in the next `days` days (today counts as one), grouped by local day.
 * Something already under way sits under today.
 */
export function groupAgenda(
  events: readonly AgendaEvent[],
  now: number,
  days: number,
  formatTime: (ms: number) => string,
  locale?: string
): AgendaDay[] {
  const todayKey = localDateKey(now);
  const endKey = addDays(todayKey, days);
  const groups = new Map<string, AgendaItem[]>();
  const sortable: Array<{ key: string; order: number; item: AgendaItem }> = [];

  for (const event of events) {
    if (event.allDay) {
      // All-day end dates are exclusive.
      if (event.end <= todayKey && event.start < todayKey) continue;
      if (event.start >= endKey) continue;
      const key = event.start < todayKey ? todayKey : event.start;
      sortable.push({ key, order: 0, item: { event, when: "All day" } });
      continue;
    }
    const start = Date.parse(event.start);
    const end = Date.parse(event.end);
    if (Number.isNaN(start) || Math.max(start, end) <= now) continue;
    const startKey = localDateKey(start);
    if (startKey >= endKey) continue;
    const ongoing = start <= now;
    sortable.push({
      key: ongoing ? todayKey : startKey,
      order: ongoing ? 1 : start,
      item: { event, when: ongoing ? "Now" : formatTime(start) },
    });
  }

  sortable.sort((a, b) => a.key.localeCompare(b.key) || a.order - b.order);
  for (const { key, item } of sortable) {
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups].map(([key, items]) => ({
    key,
    label: dayLabel(key, todayKey, locale),
    items,
  }));
}
