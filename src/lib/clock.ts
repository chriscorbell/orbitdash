import type { ClockFormat } from "@shared/dashboard-settings";

const hour12 = (format: ClockFormat) => (format === "auto" ? undefined : format === "12h");

/** Hours and minutes in the chosen format; "auto" follows the browser's locale. */
export function timeFormatter(format: ClockFormat, locale?: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, {
    hour: format === "24h" ? "2-digit" : "numeric",
    minute: "2-digit",
    hour12: hour12(format),
  });
}

export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}
