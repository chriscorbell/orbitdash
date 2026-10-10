# Integrations

An integration reads a few figures from an app's API and shows them on the app's service card,
such as Sonarr's queue or Pi-hole's blocked share. Adapters live in `server/integrations/adapters/`
and only ever read.

## How it fits together

- **Settings** are stored per service in the `settings` table under `integration.<serviceId>`.
  Secret fields (API keys, tokens, passwords) are sealed with AES-256-GCM using a key the server
  generates in `<data>/secret.key` (mode 600). The browser never receives them: `GET
/api/integrations/services/:id` returns plain values and the names of secrets that are set, and a
  save that leaves a secret out keeps the stored one. A database or export file without the key
  doesn't reveal the secrets; restoring on another machine means typing them again.
- **Polling** happens on the server in `server/integrations/poller.ts`, on each adapter's own
  interval and only while someone is looking (an open live connection, or a page that asked in
  the last five minutes). New readings go out on the `integrations` event topic, and `GET
/api/integrations/data` returns the latest for every service.
- **Removal**: settings outlive the trash so undoing a delete keeps them, and go when the trash is
  purged.

## The adapter contract

```ts
export interface IntegrationAdapter {
  id: string; // stable, stored with the settings
  name: string; // shown in the picker
  icon: string; // dashboard-icons or selfh.st slug
  fields: IntegrationField[]; // what the form asks for
  pollIntervalMs: number; // how long a reading stays fresh
  read: (config: AdapterConfig, context: AdapterContext) => Promise<IntegrationStat[]>;
}
```

- `fields` start with `URL_FIELD` (optional: the service's own link is used when it's empty) and
  usually end with `IGNORE_TLS_FIELD`. Field kinds are `url`, `text`, `secret` and `toggle`; mark
  anything sensitive as `secret`.
- `read` gets the settings with secrets decrypted, and `context.http`, which resolves paths against
  the API address, applies an 8 second deadline and the self-signed option, and turns failures
  into short messages ("It refused the credentials", "It answered HTTP 502", "Connection
  refused"). Use it instead of `fetch`, and throw `IntegrationError` for problems of your own.
- Return up to four `{ label, value, tone? }` figures with the values already formatted
  (`formatCount`, `formatPercent` and `formatRate` in `server/integrations/format.ts` help). `tone`
  is `good`, `warning` or `bad` when a figure deserves attention.

## Adding an adapter

1. Write `server/integrations/adapters/<app>.ts` exporting an `IntegrationAdapter`.
2. Add it to `ADAPTERS` in `server/integrations/adapters/index.ts`.
3. Add a case to `server/integrations/adapters.test.ts` with answers shaped like the app's real API,
   including what is sent (headers, body) and an error case.
4. List it in the README's integrations section.

## Included adapters

| App          | Needs                                     | Shows                                          |
| ------------ | ----------------------------------------- | ---------------------------------------------- |
| AdGuard Home | Username and password                     | Queries, blocked, blocked share, lookup time   |
| Jellyfin     | API key                                   | Playing now, movies, series, songs             |
| Pi-hole      | Password or app password (v6), token (v5) | Queries, blocked, blocked share, clients       |
| Plex         | Plex token                                | Playing now, movies, shows, libraries          |
| Proxmox VE   | API token ID and secret                   | Guests running, nodes online, CPU, memory      |
| qBittorrent  | Username and password                     | Download and upload speed, downloading, active |
| Radarr       | API key                                   | Queue, missing, releases this week             |
| Sonarr       | API key                                   | Queue, missing, episodes this week             |
