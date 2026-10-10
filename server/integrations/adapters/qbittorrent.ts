import { formatCount, formatRate, isRecord, num } from "../format";
import { IGNORE_TLS_FIELD, IntegrationError, URL_FIELD, type IntegrationAdapter } from "../types";

/** qBittorrent: current speeds and how many torrents are moving. */
export const qbittorrent: IntegrationAdapter = {
  id: "qbittorrent",
  name: "qBittorrent",
  icon: "qbittorrent",
  pollIntervalMs: 15_000,
  fields: [
    URL_FIELD,
    { key: "username", label: "Username", kind: "text", required: true },
    { key: "password", label: "Password", kind: "secret", required: true },
    IGNORE_TLS_FIELD,
  ],
  async read(config, { http }) {
    // qBittorrent checks that requests come from its own origin.
    const origin = new URL(config.url).origin;
    const login = await http.raw("api/v2/auth/login", {
      method: "POST",
      headers: { Referer: origin, Origin: origin },
      form: {
        username: String(config.values.username ?? ""),
        password: String(config.values.password ?? ""),
      },
    });
    const cookie = /SID=[^;]+/.exec(login.headers.get("set-cookie") ?? "")?.[0];
    const body = await login.text();
    if (!cookie && body.trim() !== "Ok.") throw new IntegrationError("It refused the credentials");
    const headers = { Referer: origin, ...(cookie ? { Cookie: cookie } : {}) };

    const [transfer, torrents] = await Promise.all([
      http.json("api/v2/transfer/info", { headers }),
      http.json("api/v2/torrents/info?filter=active", { headers }),
    ]);
    const info = isRecord(transfer) ? transfer : {};
    const down = num(info.dl_info_speed) ?? 0;
    const active = Array.isArray(torrents) ? torrents.filter(isRecord) : [];
    const downloading = active.filter((torrent) =>
      /DL|downloading|metaDL/i.test(String(torrent.state))
    ).length;
    return [
      { label: "Down", value: formatRate(down), tone: down > 0 ? "good" : undefined },
      { label: "Up", value: formatRate(num(info.up_info_speed) ?? 0) },
      { label: "Downloading", value: formatCount(downloading) },
      { label: "Active", value: formatCount(active.length) },
    ];
  },
};
