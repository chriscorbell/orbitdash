import type { IntegrationAdapter } from "../types";
import { adguard } from "./adguard";
import { radarr, sonarr } from "./arr";
import { jellyfin } from "./jellyfin";
import { pihole } from "./pihole";
import { plex } from "./plex";
import { proxmox } from "./proxmox";
import { qbittorrent } from "./qbittorrent";

/** Every adapter, in the order the picker lists them. See docs/integrations.md to add one. */
export const ADAPTERS: readonly IntegrationAdapter[] = [
  adguard,
  jellyfin,
  pihole,
  plex,
  proxmox,
  qbittorrent,
  radarr,
  sonarr,
];

export function getAdapter(id: string): IntegrationAdapter | null {
  return ADAPTERS.find((adapter) => adapter.id === id) ?? null;
}
