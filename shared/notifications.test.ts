import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_OPTIONS,
  describeDownDelay,
  DOWN_DELAY_MINUTES,
  formatDowntime,
  isDiscordWebhookUrl,
  isInQuietWindow,
  isMaskedSecret,
  isQuietAt,
  isValidTimeZone,
  minutesInZone,
  normalizeServerUrl,
  parseClock,
  parseHttpUrl,
} from "./notifications";

const quiet = (start: string, end: string, enabled = true) => ({ enabled, start, end });

describe("notification URLs", () => {
  it("accepts http(s) URLs without credentials", () => {
    expect(parseHttpUrl(" https://hooks.lan/x?y=1 ")?.href).toBe("https://hooks.lan/x?y=1");
    expect(parseHttpUrl("http://10.0.0.5:8080")?.host).toBe("10.0.0.5:8080");
    expect(parseHttpUrl("ftp://hooks.lan")).toBeNull();
    expect(parseHttpUrl("https://user:pass@hooks.lan")).toBeNull();
    expect(parseHttpUrl("https://user@hooks.lan")).toBeNull();
    expect(parseHttpUrl("not a url")).toBeNull();
  });

  it("normalizes server URLs and refuses queries and fragments", () => {
    expect(normalizeServerUrl("https://ntfy.sh/")).toBe("https://ntfy.sh");
    expect(normalizeServerUrl("https://example.com/gotify//")).toBe("https://example.com/gotify");
    expect(normalizeServerUrl("https://example.com/?token=x")).toBeNull();
    expect(normalizeServerUrl("https://example.com/#x")).toBeNull();
    expect(normalizeServerUrl("javascript:alert(1)")).toBeNull();
  });

  it("recognizes Discord webhook URLs", () => {
    expect(isDiscordWebhookUrl("https://discord.com/api/webhooks/123/abc-DEF_9")).toBe(true);
    expect(isDiscordWebhookUrl("https://discord.com/api/v10/webhooks/123/abc/")).toBe(true);
    expect(isDiscordWebhookUrl("https://discord.com/api/webhooks/123/abc?thread_id=4")).toBe(true);
    expect(isDiscordWebhookUrl("http://discord.com/api/webhooks/123/abc")).toBe(false);
    expect(isDiscordWebhookUrl("https://discord.com/channels/123/456")).toBe(false);
    expect(isDiscordWebhookUrl("nope")).toBe(false);
  });

  it("spots masked secrets wherever the mask sits", () => {
    expect(isMaskedSecret("••••a1b2")).toBe(true);
    expect(isMaskedSecret("https://discord.com/••••a1b2")).toBe(true);
    expect(isMaskedSecret("tk_real")).toBe(false);
    expect(isMaskedSecret(undefined)).toBe(false);
  });
});

describe("quiet hours", () => {
  it("parses clock times", () => {
    expect(parseClock("00:00")).toBe(0);
    expect(parseClock("22:30")).toBe(1350);
    expect(parseClock("23:59")).toBe(1439);
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("7:00")).toBeNull();
  });

  it("covers windows within a day and across midnight", () => {
    expect(isInQuietWindow(9 * 60, quiet("09:00", "17:00"))).toBe(true);
    expect(isInQuietWindow(17 * 60, quiet("09:00", "17:00"))).toBe(false);
    expect(isInQuietWindow(8 * 60, quiet("09:00", "17:00"))).toBe(false);
    expect(isInQuietWindow(23 * 60, quiet("22:00", "07:00"))).toBe(true);
    expect(isInQuietWindow(3 * 60, quiet("22:00", "07:00"))).toBe(true);
    expect(isInQuietWindow(7 * 60, quiet("22:00", "07:00"))).toBe(false);
    expect(isInQuietWindow(12 * 60, quiet("22:00", "07:00"))).toBe(false);
  });

  it("is never quiet when off, empty or unreadable", () => {
    expect(isInQuietWindow(23 * 60, quiet("22:00", "07:00", false))).toBe(false);
    expect(isInQuietWindow(10, quiet("08:00", "08:00"))).toBe(false);
    expect(isInQuietWindow(10, quiet("8", "09:00"))).toBe(false);
    expect(isInQuietWindow(10, quiet("08:00", "9"))).toBe(false);
  });

  it("reads the time of day in a time zone", () => {
    const ts = Date.UTC(2026, 0, 15, 23, 30);
    expect(minutesInZone(ts, "UTC")).toBe(23 * 60 + 30);
    expect(minutesInZone(ts, "Asia/Tokyo")).toBe(8 * 60 + 30);
    expect(minutesInZone(ts, "America/New_York")).toBe(18 * 60 + 30);
    expect(minutesInZone(Date.UTC(2026, 0, 15, 0, 5), "UTC")).toBe(5);
    expect(typeof minutesInZone(ts, null)).toBe("number");
  });

  it("decides whether a moment is quiet in the configured zone", () => {
    const options = {
      ...DEFAULT_NOTIFICATION_OPTIONS,
      quietHours: quiet("22:00", "07:00"),
      timeZone: "UTC",
    };
    expect(isQuietAt(Date.UTC(2026, 0, 15, 23), options)).toBe(true);
    expect(isQuietAt(Date.UTC(2026, 0, 15, 12), options)).toBe(false);
    expect(isQuietAt(Date.UTC(2026, 0, 15, 23), { ...options, timeZone: "Asia/Tokyo" })).toBe(
      false
    );
    expect(isQuietAt(Date.UTC(2026, 0, 15, 23), DEFAULT_NOTIFICATION_OPTIONS)).toBe(false);
  });

  it("validates IANA time zones", () => {
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone(" ")).toBe(false);
  });
});

describe("notification wording", () => {
  it("formats durations with the two largest units", () => {
    expect(formatDowntime(-5)).toBe("less than a minute");
    expect(formatDowntime(59_000)).toBe("less than a minute");
    expect(formatDowntime(12 * 60_000)).toBe("12 min");
    expect(formatDowntime(3 * 3_600_000)).toBe("3 h");
    expect(formatDowntime(3 * 3_600_000 + 5 * 60_000)).toBe("3 h 5 min");
    expect(formatDowntime(2 * 86_400_000)).toBe("2 d");
    expect(formatDowntime(2 * 86_400_000 + 4 * 3_600_000)).toBe("2 d 4 h");
  });

  it("describes every delay choice", () => {
    expect(DOWN_DELAY_MINUTES.map(describeDownDelay)).toEqual([
      "Right away",
      "After 1 min",
      "After 2 min",
      "After 5 min",
      "After 10 min",
      "After 15 min",
      "After 30 min",
      "After 1 hour",
    ]);
  });
});
