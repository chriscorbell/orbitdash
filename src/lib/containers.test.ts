import { describe, expect, it } from "vitest";
import {
  containerTone,
  describeSummary,
  portUrl,
  sortContainers,
  summarizeContainers,
} from "@/lib/containers";
import type { ContainerInfo } from "@shared/types";

const container = (name: string, extra: Partial<ContainerInfo> = {}): ContainerInfo => ({
  id: name,
  name,
  image: "img",
  state: "running",
  status: "Up",
  health: null,
  createdAt: 0,
  ports: [],
  composeProject: null,
  cpuPercent: null,
  memoryBytes: null,
  memoryLimitBytes: null,
  ...extra,
});

describe("container helpers", () => {
  const list = [
    container("web", { cpuPercent: 3, memoryBytes: 100, health: "healthy" }),
    container("db", { cpuPercent: 9, memoryBytes: 50, health: "unhealthy" }),
    container("cache", { state: "restarting" }),
    container("backup", { state: "exited" }),
    container("init", { state: "created" }),
  ];

  it("summarizes and describes the list", () => {
    const summary = summarizeContainers(list);
    expect(summary).toEqual({ total: 5, running: 2, unhealthy: 1, stopped: 2, other: 1 });
    expect(describeSummary(summary)).toBe("1 unhealthy · 1 restarting or paused · 2 stopped");
    expect(describeSummary(summarizeContainers([list[0]]))).toBeNull();
  });

  it("picks a tone per container", () => {
    expect(list.map(containerTone)).toEqual(["up", "down", "warning", "idle", "idle"]);
    expect(containerTone(container("x", { health: "starting" }))).toBe("warning");
    expect(containerTone(container("x", { state: "dead" }))).toBe("down");
  });

  it("sorts running containers first, then by the chosen column", () => {
    expect(sortContainers(list, "name").map((c) => c.name)).toEqual([
      "db",
      "web",
      "backup",
      "cache",
      "init",
    ]);
    expect(
      sortContainers(list, "cpu")
        .map((c) => c.name)
        .slice(0, 2)
    ).toEqual(["db", "web"]);
    expect(
      sortContainers(list, "memory")
        .map((c) => c.name)
        .slice(0, 2)
    ).toEqual(["web", "db"]);
    expect(sortContainers([container("b"), container("a")], "cpu").map((c) => c.name)).toEqual([
      "a",
      "b",
    ]);
    expect(sortContainers([container("b"), container("a")], "memory").map((c) => c.name)).toEqual([
      "a",
      "b",
    ]);
  });

  it("links published TCP ports on the dashboard's own host", () => {
    expect(
      portUrl({ privatePort: 80, publicPort: 8080, protocol: "tcp" }, { hostname: "nas.lan" })
    ).toBe("http://nas.lan:8080");
    expect(
      portUrl({ privatePort: 443, publicPort: 8443, protocol: "tcp" }, { hostname: "::1" })
    ).toBe("https://[::1]:8443");
    expect(
      portUrl({ privatePort: 53, publicPort: 53, protocol: "udp" }, { hostname: "nas" })
    ).toBeNull();
  });
});
