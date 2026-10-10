import { describe, expect, it } from "vitest";
import { groupAgenda, localDateKey } from "@/lib/agenda";
import { greetingFor, timeFormatter } from "@/lib/clock";
import { describeWeather, formatTemperature, weekdayOf } from "@/lib/weather";
import type { AgendaEvent } from "@shared/types";

describe("weather helpers", () => {
  it("describes WMO codes and falls back for unknown ones", () => {
    expect(describeWeather(0)).toEqual({ kind: "clear", label: "Clear" });
    expect(describeWeather(63)).toEqual({ kind: "rain", label: "Rain" });
    expect(describeWeather(99)).toEqual({ kind: "storm", label: "Thunderstorm with hail" });
    expect(describeWeather(42)).toEqual({ kind: "cloudy", label: "Unknown" });
  });

  it("rounds temperatures without a negative zero", () => {
    expect(formatTemperature(12.6)).toBe("13°");
    expect(formatTemperature(-0.4)).toBe("0°");
    expect(formatTemperature(-3.5)).toBe("-3°");
  });

  it("names forecast days as calendar dates", () => {
    expect(weekdayOf("2026-10-10", "en-US")).toBe("Sat");
  });
});

describe("clock helpers", () => {
  it("formats 12 and 24 hour time", () => {
    const at = new Date(2026, 9, 10, 15, 5).getTime();
    expect(timeFormatter("24h", "en-US").format(at)).toBe("15:05");
    expect(timeFormatter("12h", "en-US").format(at)).toBe("3:05 PM");
    expect(timeFormatter("auto", "en-GB").format(at)).toBe("15:05");
  });

  it("greets by the hour", () => {
    expect(greetingFor(4)).toBe("Good night");
    expect(greetingFor(22)).toBe("Good night");
    expect(greetingFor(5)).toBe("Good morning");
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(17)).toBe("Good evening");
  });
});

describe("groupAgenda", () => {
  const now = new Date(2026, 9, 10, 9, 0).getTime(); // Saturday 09:00 local
  const at = (day: number, hour: number, minute = 0) =>
    new Date(2026, 9, day, hour, minute).toISOString();
  const event = (id: string, extra: Partial<AgendaEvent>): AgendaEvent => ({
    id,
    feedId: "f",
    title: id,
    location: null,
    allDay: false,
    start: at(10, 10),
    end: at(10, 11),
    ...extra,
  });
  const format = (ms: number) => {
    const date = new Date(ms);
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  };

  it("groups upcoming events by day, all-day first, ongoing as now", () => {
    const days = groupAgenda(
      [
        event("Later", { start: at(10, 18), end: at(10, 19) }),
        event("Done", { start: at(10, 7), end: at(10, 8) }),
        event("Ongoing", { start: at(10, 8, 30), end: at(10, 9, 30) }),
        event("Trip", { allDay: true, start: "2026-10-09", end: "2026-10-12" }),
        event("Brunch", { start: at(11, 11), end: at(11, 12) }),
        event("Holiday", { allDay: true, start: "2026-10-12", end: "2026-10-13" }),
        event("Past trip", { allDay: true, start: "2026-10-08", end: "2026-10-10" }),
        event("Too far", { start: at(13, 9), end: at(13, 10) }),
        event("Bad", { start: "not a date", end: "nope" }),
      ],
      now,
      3,
      format,
      "en-US"
    );

    expect(
      days.map((day) => [day.label, day.items.map((item) => [item.event.title, item.when])])
    ).toEqual([
      [
        "Today",
        [
          ["Trip", "All day"],
          ["Ongoing", "Now"],
          ["Later", "18:00"],
        ],
      ],
      ["Tomorrow", [["Brunch", "11:00"]]],
      ["Mon, Oct 12", [["Holiday", "All day"]]],
    ]);
    expect(days[0].key).toBe(localDateKey(now));
  });

  it("has nothing for an empty calendar", () => {
    expect(groupAgenda([], now, 7, format)).toEqual([]);
  });
});
