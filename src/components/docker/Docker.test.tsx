// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContainersCard } from "@/components/docker/ContainersCard";
import { ContainersTile } from "@/components/docker/ContainersTile";
import { createQueryWrapper } from "@/test/query";
import type { ContainerInfo, DockerSnapshot } from "@shared/types";

const api = vi.hoisted(() => ({
  fetchDocker: vi.fn(),
  listeners: [] as Array<(snapshot: DockerSnapshot) => void>,
}));

vi.mock("@/lib/api/docker", () => ({
  fetchDocker: api.fetchDocker,
  subscribeContainers: (listener: (snapshot: DockerSnapshot) => void) => {
    api.listeners.push(listener);
    return () => {};
  },
}));

const container = (name: string, extra: Partial<ContainerInfo> = {}): ContainerInfo => ({
  id: name,
  name,
  image: `${name}:latest`,
  state: "running",
  status: "Up 2 hours",
  health: null,
  createdAt: 0,
  ports: [],
  composeProject: null,
  cpuPercent: 1.25,
  memoryBytes: 64 * 1024 * 1024,
  memoryLimitBytes: null,
  ...extra,
});

const snapshot: DockerSnapshot = {
  configured: true,
  available: true,
  error: null,
  containers: [
    container("jellyfin", {
      composeProject: "media",
      ports: [{ privatePort: 8096, publicPort: 8096, protocol: "tcp" }],
      cpuPercent: 12.5,
    }),
    container("db", { health: "unhealthy", status: "Up 1 hour (unhealthy)" }),
    container("backup", { state: "exited", status: "Exited (0) 2 days ago", cpuPercent: null }),
  ],
  updatedAt: 1,
};

beforeEach(() => {
  api.fetchDocker.mockResolvedValue(snapshot);
  api.listeners.length = 0;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ContainersTile", () => {
  it("shows how many are running and what needs a look", async () => {
    render(<ContainersTile linkToStats />, { wrapper: createQueryWrapper().wrapper });
    const link = await screen.findByRole("link", { name: /2 of 3 containers running/ });
    expect(link.getAttribute("href")).toBe("/stats#containers");
    expect(within(link).getByText("1 unhealthy · 1 stopped")).toBeTruthy();
  });

  it("follows live updates and explains when Docker is away", async () => {
    render(<ContainersTile linkToStats={false} />, { wrapper: createQueryWrapper().wrapper });
    await screen.findByLabelText("2 of 3 containers running");
    expect(screen.queryByRole("link")).toBeNull();

    api.listeners.forEach((listener) => listener({ ...snapshot, containers: [container("web")] }));
    expect(await screen.findByText("All running")).toBeTruthy();

    api.listeners.forEach((listener) =>
      listener({
        ...snapshot,
        available: false,
        error: "Docker refused the connection",
        containers: [],
      })
    );
    expect(await screen.findByText("Docker refused the connection")).toBeTruthy();
    expect(screen.getByLabelText("Containers unavailable")).toBeTruthy();
  });
});

describe("ContainersCard", () => {
  it("lists containers with state, ports and resources, sortable", async () => {
    render(<ContainersCard />, { wrapper: createQueryWrapper().wrapper });
    const card = await screen.findByRole("region", { name: "Containers" });
    expect(within(card).getByText("2 of 3 running · 1 unhealthy · 1 stopped")).toBeTruthy();
    expect(within(card).getByText("media · jellyfin:latest")).toBeTruthy();
    expect(within(card).getByRole("link", { name: "8096" }).getAttribute("href")).toMatch(/:8096$/);
    expect(within(card).getAllByText("64.0 MiB").length).toBeGreaterThan(0);

    const names = () =>
      within(card)
        .getAllByRole("listitem")
        .map((item) => item.querySelector(".font-medium")?.textContent);
    expect(names()).toEqual(["db", "jellyfin", "backup"]);
    await userEvent.setup().click(within(card).getByRole("button", { name: "CPU" }));
    expect(names()).toEqual(["jellyfin", "db", "backup"]);
  });

  it("says why Docker isn't available, and hides when it isn't set up", async () => {
    api.fetchDocker.mockResolvedValue({
      ...snapshot,
      available: false,
      error: "No permission to use the Docker socket",
      containers: [],
    });
    render(<ContainersCard />, { wrapper: createQueryWrapper().wrapper });
    expect(await screen.findByText("No permission to use the Docker socket")).toBeTruthy();

    cleanup();
    api.fetchDocker.mockResolvedValue({
      ...snapshot,
      configured: false,
      available: false,
      containers: [],
    });
    render(<ContainersCard />, { wrapper: createQueryWrapper().wrapper });
    await waitFor(() => expect(api.fetchDocker).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("region", { name: "Containers" })).toBeNull();
  });

  it("notes an empty host", async () => {
    api.fetchDocker.mockResolvedValue({ ...snapshot, containers: [] });
    render(<ContainersCard />, { wrapper: createQueryWrapper().wrapper });
    expect(await screen.findByText("No containers.")).toBeTruthy();
  });
});
