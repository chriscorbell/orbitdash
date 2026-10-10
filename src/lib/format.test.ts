import { describe, expect, it } from "vitest";
import { formatBytes, formatRate } from "@/lib/format";

describe("formatBytes", () => {
  it("uses binary units with about three significant digits", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.50 KiB");
    expect(formatBytes(15 * 1024 ** 3)).toBe("15.0 GiB");
    expect(formatBytes(456 * 1024 ** 3)).toBe("456 GiB");
    expect(formatBytes(1024 ** 6 * 3)).toBe("3072 PiB");
  });

  it("formats rates per second", () => {
    expect(formatRate(2 * 1024 * 1024)).toBe("2.00 MiB/s");
  });
});
