import { describe, expect, it } from "bun:test";
import { createDockerClient, DockerError, resolveDockerEndpoint } from "./client";
import { cpuPercent, parseContainer, parseStats } from "./containers";
import { createDockerMonitor } from "./monitor";
import type { DockerSnapshot } from "@shared/types";

describe("resolveDockerEndpoint", () => {
  const noSocket = () => false;

  it("reads ORBITDASH_DOCKER_HOST, then DOCKER_HOST, then a mounted socket", () => {
    expect(
      resolveDockerEndpoint({ ORBITDASH_DOCKER_HOST: "tcp://dockerproxy:2375" }, noSocket)
    ).toEqual({
      baseUrl: "http://dockerproxy:2375",
      socketPath: null,
      description: "dockerproxy:2375",
    });
    expect(resolveDockerEndpoint({ DOCKER_HOST: "unix:///run/docker.sock" }, noSocket)).toEqual({
      baseUrl: "http://docker",
      socketPath: "/run/docker.sock",
      description: "/run/docker.sock",
    });
    expect(
      resolveDockerEndpoint({ DOCKER_HOST: "https://user:pw@docker.lan:2376" }, noSocket)
    ).toEqual({
      baseUrl: "https://docker.lan:2376",
      socketPath: null,
      description: "docker.lan:2376",
    });
    expect(resolveDockerEndpoint({}, () => true)?.socketPath).toBe("/var/run/docker.sock");
  });

  it("turns off or ignores what it can't use", () => {
    expect(
      resolveDockerEndpoint({ ORBITDASH_DOCKER_HOST: "off", DOCKER_HOST: "tcp://x:1" }, () => true)
    ).toBeNull();
    expect(resolveDockerEndpoint({}, noSocket)).toBeNull();
    expect(resolveDockerEndpoint({ DOCKER_HOST: "ssh://me@host" }, noSocket)).toBeNull();
    expect(resolveDockerEndpoint({ DOCKER_HOST: "tcp://" }, noSocket)).toBeNull();
  });
});

describe("docker client", () => {
  const endpoint = {
    baseUrl: "http://docker",
    socketPath: "/var/run/docker.sock",
    description: "socket",
  };

  it("talks over the socket and explains failures without leaking details", async () => {
    const calls: Array<{ url: string; unix?: string }> = [];
    let answer: () => Response | Promise<Response> = () => Response.json([{ Id: "a" }]);
    const client = createDockerClient(endpoint, {
      fetch: async (url, init) => {
        calls.push({ url, unix: init.unix });
        return answer();
      },
    });
    expect(await client.getJson("/containers/json")).toEqual([{ Id: "a" }]);
    expect(calls[0]).toEqual({
      url: "http://docker/containers/json",
      unix: "/var/run/docker.sock",
    });

    answer = () => new Response("nope", { status: 403 });
    await expect(client.getJson("/x")).rejects.toThrow("The Docker proxy doesn't allow this");
    answer = () => new Response("boom", { status: 500 });
    await expect(client.getJson("/x")).rejects.toThrow("Docker answered 500");
    for (const [code, message] of [
      ["EACCES", "No permission to use the Docker socket"],
      ["ENOENT", "The Docker socket isn't there"],
      ["ECONNREFUSED", "Docker refused the connection"],
      ["ENOTFOUND", "The Docker host wasn't found"],
      ["EWHATEVER", "Docker can't be reached"],
    ]) {
      answer = () => Promise.reject(Object.assign(new Error("secret path"), { code }));
      await expect(client.getJson("/x")).rejects.toThrow(message);
    }
    answer = () => Promise.reject(new DOMException("timeout", "TimeoutError"));
    await expect(client.getJson("/x")).rejects.toThrow("Docker didn't answer");

    answer = () => new Response(null);
    await expect(client.stream("/events", new AbortController().signal)).rejects.toBeInstanceOf(
      DockerError
    );
  });

  it("uses plain HTTP for a TCP endpoint", async () => {
    const seen: Array<{ url: string; unix?: string }> = [];
    const client = createDockerClient(
      { baseUrl: "http://proxy:2375", socketPath: null, description: "proxy:2375" },
      {
        fetch: async (url, init) => {
          seen.push({ url, unix: init.unix });
          return Response.json({});
        },
      }
    );
    await client.getJson("/version", new AbortController().signal);
    expect(seen).toEqual([{ url: "http://proxy:2375/version", unix: undefined }]);
  });
});

const LIST = [
  {
    Id: "c1012de51ce5aaaaaaaa",
    Names: ["/web"],
    Image: "nginx:alpine@sha256:abc123",
    State: "running",
    Status: "Up 3 hours (healthy)",
    Created: 1_700_000_000,
    Ports: [
      { IP: "0.0.0.0", PrivatePort: 80, PublicPort: 8080, Type: "tcp" },
      { IP: "::", PrivatePort: 80, PublicPort: 8080, Type: "tcp" },
      { PrivatePort: 443, Type: "tcp" },
      { IP: "0.0.0.0", PrivatePort: 53, PublicPort: 53, Type: "udp" },
    ],
    Labels: { "com.docker.compose.project": "media" },
  },
  {
    Id: "2979aa1efa6abbbbbbbb",
    Names: ["/backup"],
    Image: "restic",
    State: "exited",
    Status: "Exited (0) 2 days ago",
    Created: 1_700_000_100,
    Labels: null,
  },
];

describe("parsing", () => {
  it("reads containers from the list", () => {
    expect(parseContainer(LIST[0])).toEqual({
      id: "c1012de51ce5",
      name: "web",
      image: "nginx:alpine",
      state: "running",
      status: "Up 3 hours (healthy)",
      health: "healthy",
      createdAt: 1_700_000_000_000,
      ports: [
        { privatePort: 53, publicPort: 53, protocol: "udp" },
        { privatePort: 80, publicPort: 8080, protocol: "tcp" },
      ],
      composeProject: "media",
    });
    expect(parseContainer(LIST[1])).toMatchObject({
      health: null,
      composeProject: null,
      ports: [],
    });
    expect(
      parseContainer({ Id: "abcdef1234567890", State: "weird", Health: { Status: "starting" } })
    ).toMatchObject({
      name: "abcdef123456",
      state: "created",
      health: "starting",
      image: "",
      createdAt: 0,
    });
    expect(parseContainer({ Id: "x", Status: "Up 1 minute (health: starting)" })?.health).toBe(
      "starting"
    );
    expect(parseContainer({ Id: "x", Health: { Status: "unhealthy" } })?.health).toBe("unhealthy");
    expect(parseContainer({ Names: ["/x"] })).toBeNull();
  });

  it("reads memory without reclaimable cache and works out CPU between samples", () => {
    const stats = (total: number, system: number) => ({
      cpu_stats: { cpu_usage: { total_usage: total }, system_cpu_usage: system },
      memory_stats: {
        usage: 100_000_000,
        limit: 1_000_000_000,
        stats: { inactive_file: 20_000_000 },
      },
    });
    const first = parseStats(stats(1_000, 100_000));
    expect(first).toEqual({
      cpu: { containerUsage: 1_000, systemUsage: 100_000 },
      memoryBytes: 80_000_000,
      memoryLimitBytes: 1_000_000_000,
    });
    const second = parseStats(stats(6_000, 200_000));
    expect(cpuPercent(undefined, second.cpu!)).toBeNull();
    expect(cpuPercent(first.cpu!, second.cpu!)).toBe(5);
    expect(cpuPercent(second.cpu!, first.cpu!)).toBeNull();
    expect(parseStats({ memory_stats: { usage: 5, stats: { total_inactive_file: 2 } } })).toEqual({
      cpu: null,
      memoryBytes: 3,
      memoryLimitBytes: null,
    });
    expect(parseStats(null)).toEqual({ cpu: null, memoryBytes: null, memoryLimitBytes: null });
    expect(parseStats({})).toEqual({ cpu: null, memoryBytes: null, memoryLimitBytes: null });
  });
});

describe("docker monitor", () => {
  function fakeDocker() {
    let list: unknown = LIST;
    let failing: string | null = null;
    let events: ReadableStreamDefaultController<Uint8Array> | null = null;
    let total = 1_000;
    const requests: string[] = [];
    const client = {
      async getJson(path: string) {
        requests.push(path);
        if (failing) throw new DockerError(failing);
        if (path.startsWith("/containers/json")) return list;
        total += 5_000;
        return {
          cpu_stats: { cpu_usage: { total_usage: total }, system_cpu_usage: total * 20 },
          memory_stats: { usage: 50_000_000, limit: 2_000_000_000 },
        };
      },
      async stream() {
        return new ReadableStream<Uint8Array>({
          start(controller) {
            events = controller;
          },
        });
      },
    };
    return {
      client,
      requests,
      setList: (next: unknown) => (list = next),
      fail: (message: string | null) => (failing = message),
      emit: (line: string) => events?.enqueue(new TextEncoder().encode(line)),
      end: () => events?.close(),
    };
  }

  it("lists containers with resources and publishes only real changes", async () => {
    const docker = fakeDocker();
    const changes: DockerSnapshot[] = [];
    const monitor = createDockerMonitor({
      endpoint: { baseUrl: "http://docker", socketPath: "/s", description: "/s" },
      client: docker.client,
      now: () => 1,
      onChange: (snapshot) => changes.push(snapshot),
    });

    await monitor.refreshForTesting();
    let snapshot = monitor.snapshot();
    expect(snapshot).toMatchObject({
      configured: true,
      available: true,
      error: null,
      updatedAt: 1,
    });
    expect(snapshot.containers.map((container) => container.name)).toEqual(["backup", "web"]);
    expect(snapshot.containers[1]).toMatchObject({ cpuPercent: null, memoryBytes: 50_000_000 });
    // Only the running container's stats were asked for.
    expect(docker.requests.filter((path) => path.includes("/stats"))).toEqual([
      "/containers/c1012de51ce5/stats?stream=false&one-shot=true",
    ]);

    await monitor.refreshForTesting();
    snapshot = monitor.snapshot();
    expect(snapshot.containers[1].cpuPercent).toBe(5);
    const published = changes.length;
    await monitor.refreshForTesting();
    expect(changes.length).toBe(published);

    docker.setList([LIST[1]]);
    await monitor.refreshForTesting();
    expect(monitor.snapshot().containers.map((container) => container.name)).toEqual(["backup"]);
  });

  it("reports Docker going away and coming back", async () => {
    const docker = fakeDocker();
    const monitor = createDockerMonitor({
      endpoint: { baseUrl: "http://docker", socketPath: "/s", description: "/s" },
      client: docker.client,
      onChange: () => {},
    });
    docker.fail("Docker refused the connection");
    await monitor.refreshForTesting();
    expect(monitor.snapshot()).toMatchObject({
      available: false,
      error: "Docker refused the connection",
      containers: [],
    });
    docker.fail(null);
    await monitor.refreshForTesting();
    expect(monitor.snapshot().available).toBe(true);
  });

  it("refreshes soon after a container event and stops cleanly", async () => {
    const docker = fakeDocker();
    const monitor = createDockerMonitor({
      endpoint: { baseUrl: "http://docker", socketPath: "/s", description: "/s" },
      client: docker.client,
      onChange: () => {},
    });
    monitor.start();
    monitor.start();
    await Bun.sleep(50);
    const before = docker.requests.filter((path) => path.startsWith("/containers/json")).length;
    docker.setList([LIST[0]]);
    docker.emit('{"Type":"container","Action":"die"}\n{"Action":"exec_start: sh"}\nnot json\n');
    await Bun.sleep(600);
    expect(docker.requests.filter((path) => path.startsWith("/containers/json")).length).toBe(
      before + 1
    );
    expect(monitor.snapshot().containers.map((container) => container.name)).toEqual(["web"]);
    monitor.stop();
    docker.end();
  });

  it("stays quiet without an endpoint", async () => {
    const monitor = createDockerMonitor({ endpoint: null, onChange: () => {} });
    monitor.start();
    await monitor.refreshForTesting();
    expect(monitor.snapshot()).toEqual({
      configured: false,
      available: false,
      error: "Docker isn't set up",
      containers: [],
      updatedAt: null,
    });
    monitor.stop();
  });
});
