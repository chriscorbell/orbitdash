import type { DockerSnapshot, HostSnapshot, Service } from "@shared/types";
import type { StoredStatus } from "./status/state";

export interface PrometheusInput {
  snapshot: HostSnapshot;
  uptimeSeconds: number;
  services: readonly Service[];
  statuses: readonly StoredStatus[];
  docker: DockerSnapshot;
  alertsFiring: number;
}

type Labels = Record<string, string | number | null | undefined>;

/** Backslash, double quote and newline are the only characters label values must escape. */
function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function formatValue(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (!Number.isFinite(value)) return value > 0 ? "+Inf" : "-Inf";
  return String(value);
}

/** Text exposition format 0.0.4: HELP and TYPE once per metric, then one line per series. */
class Exposition {
  private lines: string[] = [];

  gauge(name: string, help: string, series: Array<[Labels, number | null | undefined]>) {
    const present = series.filter(
      (entry): entry is [Labels, number] => typeof entry[1] === "number"
    );
    if (present.length === 0) return;
    this.lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`);
    for (const [labels, value] of present) {
      const pairs = Object.entries(labels)
        .filter(
          (pair): pair is [string, string | number] => pair[1] !== null && pair[1] !== undefined
        )
        .map(([key, label]) => `${key}="${escapeLabel(String(label))}"`);
      this.lines.push(`${name}${pairs.length ? `{${pairs.join(",")}}` : ""} ${formatValue(value)}`);
    }
  }

  toString() {
    return `${this.lines.join("\n")}\n`;
  }
}

const one = (value: number | null | undefined): Array<[Labels, number | null | undefined]> => [
  [{}, value],
];

/** Host metrics, service checks and containers in Prometheus text format. */
export function renderPrometheus(input: PrometheusInput): string {
  const { snapshot } = input;
  const out = new Exposition();

  out.gauge(
    "orbitdash_host_uptime_seconds",
    "Seconds since the host booted.",
    one(input.uptimeSeconds)
  );
  out.gauge("orbitdash_cpu_usage_percent", "CPU in use across all cores.", one(snapshot.cpu.usage));
  out.gauge(
    "orbitdash_cpu_core_usage_percent",
    "CPU in use per core.",
    snapshot.cpu.cores.map((core) => [{ core: core.id }, core.usage])
  );
  out.gauge(
    "orbitdash_load_average",
    "System load average.",
    snapshot.cpu.load
      ? [
          [{ period: "1m" }, snapshot.cpu.load.one],
          [{ period: "5m" }, snapshot.cpu.load.five],
          [{ period: "15m" }, snapshot.cpu.load.fifteen],
        ]
      : []
  );

  const memory = snapshot.memory;
  out.gauge("orbitdash_memory_total_bytes", "Physical memory.", one(memory?.totalBytes));
  out.gauge("orbitdash_memory_used_bytes", "Memory in use, without cache.", one(memory?.usedBytes));
  out.gauge(
    "orbitdash_memory_available_bytes",
    "Memory available to programs.",
    one(memory?.availableBytes)
  );
  out.gauge("orbitdash_swap_total_bytes", "Swap space.", one(memory?.swapTotalBytes));
  out.gauge("orbitdash_swap_used_bytes", "Swap in use.", one(memory?.swapUsedBytes));

  const fsLabels = (filesystem: HostSnapshot["filesystems"][number]) => ({
    mountpoint: filesystem.mountpoint,
    device: filesystem.device,
    fstype: filesystem.type,
  });
  out.gauge(
    "orbitdash_filesystem_size_bytes",
    "Filesystem size.",
    snapshot.filesystems.map((filesystem) => [fsLabels(filesystem), filesystem.totalBytes])
  );
  out.gauge(
    "orbitdash_filesystem_used_bytes",
    "Filesystem space in use.",
    snapshot.filesystems.map((filesystem) => [fsLabels(filesystem), filesystem.usedBytes])
  );
  out.gauge(
    "orbitdash_filesystem_available_bytes",
    "Filesystem space available to unprivileged users.",
    snapshot.filesystems.map((filesystem) => [fsLabels(filesystem), filesystem.availableBytes])
  );
  out.gauge(
    "orbitdash_disk_read_bytes_per_second",
    "Disk reads.",
    snapshot.disks.map((disk) => [{ device: disk.name }, disk.readBytesPerSec])
  );
  out.gauge(
    "orbitdash_disk_written_bytes_per_second",
    "Disk writes.",
    snapshot.disks.map((disk) => [{ device: disk.name }, disk.writeBytesPerSec])
  );
  out.gauge(
    "orbitdash_network_receive_bytes_per_second",
    "Network traffic received.",
    snapshot.network.map((nic) => [{ interface: nic.name }, nic.rxBytesPerSec])
  );
  out.gauge(
    "orbitdash_network_transmit_bytes_per_second",
    "Network traffic sent.",
    snapshot.network.map((nic) => [{ interface: nic.name }, nic.txBytesPerSec])
  );
  out.gauge(
    "orbitdash_temperature_celsius",
    "Sensor temperatures.",
    snapshot.temperatures.map((sensor) => [
      { chip: sensor.chip, sensor: sensor.label ?? sensor.id },
      sensor.celsius,
    ])
  );
  out.gauge("orbitdash_alerts_firing", "Threshold alerts firing now.", one(input.alertsFiring));

  // Only services with a check that has reported something.
  const byId = new Map(input.services.map((service) => [service.id, service]));
  const checked = input.statuses.flatMap((status) => {
    const service = byId.get(status.serviceId);
    return service?.check_enabled && status.state !== "unknown" ? [{ service, status }] : [];
  });
  const serviceLabels = (service: Service) => ({
    service: service.name,
    category: service.category ?? "",
  });
  out.gauge(
    "orbitdash_service_up",
    "Whether the service's status check passes (slow counts as up).",
    checked.map(({ service, status }) => [serviceLabels(service), status.state === "down" ? 0 : 1])
  );
  out.gauge(
    "orbitdash_service_slow",
    "Whether the service answered but slower than the slow threshold.",
    checked.map(({ service, status }) => [
      serviceLabels(service),
      status.state === "degraded" ? 1 : 0,
    ])
  );
  out.gauge(
    "orbitdash_service_response_milliseconds",
    "Response time of the last check.",
    checked.map(({ service, status }) => [serviceLabels(service), status.latencyMs])
  );

  const { docker } = input;
  if (docker.configured) {
    out.gauge("orbitdash_docker_up", "Whether Docker answers.", one(docker.available ? 1 : 0));
  }
  if (docker.available) {
    const states = new Map<string, number>();
    for (const container of docker.containers) {
      states.set(container.state, (states.get(container.state) ?? 0) + 1);
    }
    out.gauge(
      "orbitdash_docker_containers",
      "Containers by state.",
      [...states].map(([state, count]) => [{ state }, count])
    );
    out.gauge(
      "orbitdash_container_running",
      "Whether a container is running.",
      docker.containers.map((container) => [
        { container: container.name, image: container.image },
        container.state === "running" ? 1 : 0,
      ])
    );
    out.gauge(
      "orbitdash_container_healthy",
      "Whether a container with a health check reports healthy.",
      docker.containers.map((container) => [
        { container: container.name },
        container.health === null ? null : container.health === "healthy" ? 1 : 0,
      ])
    );
    out.gauge(
      "orbitdash_container_cpu_percent",
      "Container CPU as a share of the whole host.",
      docker.containers.map((container) => [{ container: container.name }, container.cpuPercent])
    );
    out.gauge(
      "orbitdash_container_memory_bytes",
      "Container memory in use, without reclaimable cache.",
      docker.containers.map((container) => [{ container: container.name }, container.memoryBytes])
    );
  }

  return out.toString();
}
