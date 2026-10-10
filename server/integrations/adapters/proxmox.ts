import { formatPercent, isRecord, num } from "../format";
import { IGNORE_TLS_FIELD, URL_FIELD, type IntegrationAdapter } from "../types";

/** Proxmox VE: guests running, nodes online, and cluster CPU and memory. */
export const proxmox: IntegrationAdapter = {
  id: "proxmox",
  name: "Proxmox VE",
  icon: "proxmox",
  pollIntervalMs: 30_000,
  fields: [
    URL_FIELD,
    {
      key: "tokenId",
      label: "API token ID",
      kind: "text",
      required: true,
      placeholder: "monitor@pve!orbitdash",
      help: "Datacenter, Permissions, API Tokens. PVEAuditor is enough.",
    },
    { key: "tokenSecret", label: "Token secret", kind: "secret", required: true },
    { ...IGNORE_TLS_FIELD, help: "Proxmox uses a self-signed certificate unless you replaced it." },
  ],
  async read(config, { http }) {
    const answer = await http.json("api2/json/cluster/resources", {
      headers: {
        Authorization: `PVEAPIToken=${String(config.values.tokenId ?? "")}=${String(config.values.tokenSecret ?? "")}`,
      },
    });
    const resources =
      isRecord(answer) && Array.isArray(answer.data) ? answer.data.filter(isRecord) : [];
    const nodes = resources.filter((resource) => resource.type === "node");
    const online = nodes.filter((node) => node.status === "online");
    const guests = resources.filter(
      (resource) => resource.type === "qemu" || resource.type === "lxc"
    );
    const running = guests.filter((guest) => guest.status === "running").length;

    let cpu = 0;
    let cpus = 0;
    let mem = 0;
    let maxmem = 0;
    for (const node of online) {
      const nodeCpus = num(node.maxcpu) ?? 0;
      cpu += (num(node.cpu) ?? 0) * nodeCpus;
      cpus += nodeCpus;
      mem += num(node.mem) ?? 0;
      maxmem += num(node.maxmem) ?? 0;
    }
    const cpuPercent = cpus ? (cpu / cpus) * 100 : 0;
    const memPercent = maxmem ? (mem / maxmem) * 100 : 0;
    return [
      { label: "Guests running", value: `${running}/${guests.length}` },
      {
        label: "Nodes online",
        value: `${online.length}/${nodes.length}`,
        tone: online.length < nodes.length ? "bad" : undefined,
      },
      {
        label: "CPU",
        value: formatPercent(cpuPercent),
        tone: cpuPercent >= 90 ? "warning" : undefined,
      },
      {
        label: "Memory",
        value: formatPercent(memPercent),
        tone: memPercent >= 90 ? "warning" : undefined,
      },
    ];
  },
};
