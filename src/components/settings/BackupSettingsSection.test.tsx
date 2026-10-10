// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupSettingsSection } from "@/components/settings/BackupSettingsSection";
import { formatRelativeAge } from "@/lib/format";

const apiMocks = vi.hoisted(() => ({
  createSnapshot: vi.fn(),
  fetchSnapshots: vi.fn(),
  importBackup: vi.fn(),
}));

vi.mock("@/lib/api/backup", () => ({
  BACKUP_EXPORT_URL: "/api/backup/export",
  ...apiMocks,
}));

const reloadMock = vi.fn();

beforeEach(() => {
  apiMocks.fetchSnapshots.mockResolvedValue([]);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload: reloadMock },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function backupFile(contents: string, name = "orbitdash-backup.json") {
  return new File([contents], name, { type: "application/json" });
}

describe("BackupSettingsSection", () => {
  it("links to the export download and shows the latest snapshot", async () => {
    apiMocks.fetchSnapshots.mockResolvedValue([
      {
        createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
        name: "n",
        reason: "nightly",
        sizeBytes: 1,
      },
    ]);

    render(<BackupSettingsSection />);

    expect(screen.getByRole("link", { name: /export/i })).toHaveProperty(
      "href",
      expect.stringContaining("/api/backup/export")
    );
    expect(await screen.findByText(/last snapshot 3 hours ago/i)).toBeTruthy();
  });

  it("explains when no snapshots exist yet", async () => {
    render(<BackupSettingsSection />);
    expect(await screen.findByText(/no snapshots yet/i)).toBeTruthy();
  });

  it("rejects files that are not orbitdash backups", async () => {
    const user = userEvent.setup();
    render(<BackupSettingsSection />);

    await user.upload(screen.getByLabelText("Backup file to import"), backupFile("{}"));

    expect(await screen.findByText("That file isn't an orbitdash backup.")).toBeTruthy();
    expect(apiMocks.importBackup).not.toHaveBeenCalled();
  });

  it("confirms before replacing data, then reloads", async () => {
    const user = userEvent.setup();
    apiMocks.importBackup.mockResolvedValue({ icons: 0, services: 2, snapshot: "s" });
    const contents = JSON.stringify({ format: "orbitdash-backup", services: [{}, {}] });
    render(<BackupSettingsSection />);

    await user.upload(screen.getByLabelText("Backup file to import"), backupFile(contents));
    expect(await screen.findByText(/it has 2 services/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Replace" }));

    expect(apiMocks.importBackup).toHaveBeenCalledWith(contents);
    expect(reloadMock).toHaveBeenCalled();
  });

  it("lets the user back out of an import", async () => {
    const user = userEvent.setup();
    const contents = JSON.stringify({ format: "orbitdash-backup", services: [{}] });
    render(<BackupSettingsSection />);

    await user.upload(screen.getByLabelText("Backup file to import"), backupFile(contents));
    expect(await screen.findByText(/it has 1 service\./i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: /import/i })).toBeTruthy();
    expect(apiMocks.importBackup).not.toHaveBeenCalled();
  });

  it("shows server errors from a failed import", async () => {
    const user = userEvent.setup();
    apiMocks.importBackup.mockRejectedValue(new Error("unsupported backup version"));
    const contents = JSON.stringify({ format: "orbitdash-backup", services: [] });
    render(<BackupSettingsSection />);

    await user.upload(screen.getByLabelText("Backup file to import"), backupFile(contents));
    await user.click(await screen.findByRole("button", { name: "Replace" }));

    expect(await screen.findByText("unsupported backup version")).toBeTruthy();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("takes a manual snapshot on demand", async () => {
    const user = userEvent.setup();
    apiMocks.createSnapshot.mockResolvedValue({
      createdAt: new Date().toISOString(),
      name: "manual",
      reason: "manual",
      sizeBytes: 10,
    });
    render(<BackupSettingsSection />);
    await screen.findByText(/no snapshots yet/i);

    await user.click(screen.getByRole("button", { name: /snapshot/i }));

    expect(await screen.findByText(/last snapshot just now/i)).toBeTruthy();
  });
});

describe("formatUptime and formatPercent", () => {
  it("formats uptimes with the two largest units", async () => {
    const { formatPercent, formatUptime } = await import("@/lib/format");
    expect(formatUptime(14 * 86_400 + 3 * 3_600 + 59)).toBe("14d 3h");
    expect(formatUptime(5 * 3_600 + 12 * 60)).toBe("5h 12m");
    expect(formatUptime(8 * 60 + 30)).toBe("8m");
    expect(formatUptime(-5)).toBe("0m");
    expect(formatPercent(4.25)).toBe("4.3");
    expect(formatPercent(72.6)).toBe("73");
  });
});

describe("formatRelativeAge", () => {
  it("picks the largest whole unit", () => {
    const now = Date.parse("2026-10-10T12:00:00.000Z");
    expect(formatRelativeAge("2026-10-08T12:00:00.000Z", now)).toBe("2 days ago");
    expect(formatRelativeAge("2026-10-10T11:30:00.000Z", now)).toBe("30 minutes ago");
    expect(formatRelativeAge("2026-10-10T11:59:50.000Z", now)).toBe("just now");
  });
});
