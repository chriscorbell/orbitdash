# Bundle Size Budget

Orbitdash splits the build into the app entry, React, the other third-party code the first render
needs, drag and drop, Zod, and lazily loaded dialogs. Those chunks have explicit bundle
budgets.

## Chunk Layout

Chunking is configured with Rolldown's `codeSplitting.groups` in `vite.config.ts` (the replacement
for the deprecated `manualChunks`). A group also captures the dependencies of the modules it
matches, so group priority decides where shared packages land:

1. `react-vendor`: React, React DOM, and the scheduler. It has the highest priority so that no
   other group pulls React in as a dependency.
2. `validation`: zod/mini and the Zod core it uses, for parsing API responses in the browser.
   Full Zod never loads in the browser: forms validate with plain checks and the server validates
   everything again. The app's own schemas ship in the entry, so this chunk's hash only
   changes when Zod does.
3. `drag-drop`: dnd-kit. Only the lazily loaded `EditableBoard` (edit mode) imports it.
4. `icons`: lucide-react.
5. `vendor`: everything else in `node_modules` that the first render needs (Radix, Floating UI,
   tailwind-merge). The `$initial` tag keeps packages used only by lazy chunks, like the Select
   and Tabs primitives, inside those chunks.

The entry chunk then holds only app code, so a typical app change invalidates about 12 kB of
brotli instead of the vendor code too.

`drag-drop-*`, `SettingsDialog-*`, `EditableBoard-*`, `StatsPage-*`, `CommandPalette-*`, `ServiceStatus-*` (status dots and details, loaded by the first card with checks on) and `pwa-*` (service worker setup, imported after the page has loaded) must never be loaded up front. If React lands in one of them again,
or an always-loaded module imports dnd-kit directly, the entry starts importing that
chunk statically and `index.html` modulepreloads it. `npm run bundle:check` fails when that
happens.

## Current Budgets

| Asset group           | Budget raw | Budget gzip | Current baseline                             |
| --------------------- | ---------: | ----------: | -------------------------------------------- |
| `index-*.js`          |      68 kB |       23 kB | about 66 kB raw / 22.5 kB gzip / 19.8 kB br  |
| `index-*.css`         |      90 kB |       15 kB | about 89 kB raw / 14.4 kB gzip / 12.1 kB br  |
| `react-vendor-*.js`   |     230 kB |       72 kB | about 214 kB raw / 66.0 kB gzip / 56.7 kB br |
| `vendor-*.js`         |     110 kB |       34 kB | about 96 kB raw / 29.0 kB gzip / 26.0 kB br  |
| `validation-*.js`     |      22 kB |        7 kB | about 19 kB raw / 6.0 kB gzip / 5.5 kB br    |
| `ServiceDialog-*.js`  |     100 kB |       28 kB | about 33 kB raw / 10.4 kB gzip / 9.4 kB br   |
| `SettingsDialog-*.js` |      24 kB |        8 kB | about 10 kB raw / 3.4 kB gzip / 3.0 kB br    |
| `EditableBoard-*.js`  |      44 kB |       14 kB | about 38 kB raw / 12.0 kB gzip / 10.8 kB br  |
| `StatsPage-*.js`      |      74 kB |       30 kB | about 67 kB raw / 27.8 kB gzip (with uPlot)  |
| `CommandPalette-*.js` |      10 kB |        4 kB | about 7 kB raw / 2.8 kB gzip                 |
| `drag-drop-*.js`      |      48 kB |       16 kB | about 47 kB raw / 15.3 kB gzip / 13.8 kB br  |
| `ServiceStatus-*.js`  |      10 kB |        4 kB | about 7 kB raw / 2.8 kB gzip / 2.6 kB br     |
| `sw.js`               |       8 kB |        3 kB | about 4 kB raw / 1.8 kB gzip / 1.6 kB br     |

Sizes are in KiB, as printed by the check script.

`sw.js` is the offline service worker. It is built separately into the site root and never loads
with the page, so it is not part of the chunk layout above.

## How To Check

```bash
npm run build
npm run bundle:check
```

`npm run build` ends with `scripts/compress-assets.mjs`, which writes `.br` and `.gz` siblings next
to every text asset of 512 bytes or more. The server sends those precompressed files to browsers
that accept them.

The check reads the built files in `dist/assets` (and `dist/sw.js`) and fails if:

- any tracked chunk crosses its raw or gzip budget
- a tracked chunk is missing its `.br` or `.gz` sibling
- `dist/index.html` references a `drag-drop-*`, `SettingsDialog-*`, `EditableBoard-*`, `StatsPage-*`, `CommandPalette-*`, `ServiceStatus-*` or `pwa-*` chunk

## History

- Status checks keep their card UI (the dot, the details with the uptime bar, the status cache and
  its event subscription) in a lazy `ServiceStatus-*` chunk of about 2.9 kB gzip, loaded by the
  first card with checks on, so a dashboard without checks never downloads it. The rules both the
  status UI and the service form use (`shared/status.ts`) land in a small shared chunk of about
  0.7 kB gzip. The entry only gained the two `lazy()` components, the reserved dot slot and the new
  service fields: about 0.2 kB gzip, leaving it at about 22.5 kB of its 23 kB budget, so the next
  entry growth should come with a split rather than a higher budget. The CSS grew by about 0.2 kB
  gzip (the dot, the details and the dialog section) and stays within its budget.
- The installable app keeps its service worker setup (registration and the stale-chunk reload) out
  of the entry: `main.tsx` imports it after the page's load event, as a `pwa-*` chunk of about
  0.5 kB gzip. The entry only gained that import and the event stream's reconnect refresh, about
  0.1 kB gzip. The worker itself is the separate `sw.js` with its own budget.
- The command palette loads on demand in `CommandPalette-*` (about 3 kB gzip), prefetched a couple
  of seconds after load and on hover or focus of the search field, so the first keystroke opens it
  right away. Removing the inline search filter roughly offset the shortcut handling in the entry.
  The shared CSS file reached 85 kB raw / 14 kB gzip, so its budget went to 90 kB / 15 kB. Tailwind
  emits one stylesheet for every chunk, so lazy UI keeps adding to it.
- The Stats page and uPlot live in a lazy `StatsPage-*` chunk (about 28 kB gzip, with its own small
  CSS file), prefetched on hover or focus of the Stats tab. The host snapshot and history schemas
  moved out of the entry into that chunk (about 0.4 kB gzip). The router, page tabs and Stats page
  setting still added about 0.5 kB, and the entry is now many small app modules with no single
  large split left, so its budget went from 64 kB / 21 kB to 68 kB / 23 kB.
- Phone layouts (bottom-sheet dialogs, two-column grids, larger touch targets) and motion
  utilities added about 0.6 kB gzip of CSS, so the CSS budget went from 80 kB / 13 kB to
  84 kB / 14 kB. The CSS is one file shared by the entry and every lazy chunk, which is why lazy UI
  still counts here. The entry JS (about 20.9 kB gzip) is close to its 21 kB budget; the next JS
  growth should come with a chunk split rather than a higher budget.
- Wallpaper, dashboard name, accent favicon and custom CSS added about 1.5 kB gzip to the entry
  (the settings controls themselves load with the lazy settings dialog). With the previous change
  having taken about 22 kB gzip off the first paint, the entry budget went from 62 kB / 20 kB to
  64 kB / 21 kB and the CSS raw budget from 76 kB to 80 kB (its gzip budget stays at 13 kB).
- Edit mode moved card menus and drag and drop into a lazy `EditableBoard-*` chunk, loaded when
  the Edit layout button is hovered, focused or clicked. Outside edit mode cards are plain links, so
  the Radix dropdown menu left the first paint and `vendor-*` fell from about 163 kB / 51 kB to
  96 kB / 29 kB; its budget came down from 180 kB / 56 kB to 110 kB / 34 kB. dnd-kit now also brings
  its mouse and touch sensors and drag overlay, so `drag-drop-*` grew to about 47 kB.
- Board layouts added column packing, card densities and icon plates to the entry, and the
  settings dialog moved into its own lazy `SettingsDialog-*` chunk, loaded when the settings button
  is hovered, focused or clicked. The entry fell to about 57 kB / 19 kB, so its budget came back
  down from 72 kB / 22 kB to 62 kB / 20 kB.
- Browser responses moved to zod/mini and the service form dropped full Zod, cutting
  `validation-*` from about 82 kB / 23 kB gzip to 19 kB / 6 kB, so its budget fell from 85 kB /
  24 kB to 22 kB / 7 kB. TanStack Query and Radix Toast joined `vendor-*` (budget 145 kB / 47 kB
  to 180 kB / 56 kB) and the toast store joined the entry (60 kB / 18 kB to 66 kB / 20 kB). The
  first paint still got smaller overall: about 87 kB to 78 kB gzip across the three chunks.
- The entry budget was cut from 145 kB raw / 45 kB gzip to 60 kB / 18 kB when third-party UI code
  moved into `vendor-*`. The old `manualChunks` setup put React inside `charts-*`, so the entry
  imported Chart.js and dnd-kit statically and `index.html` preloaded both. The React vendor,
  charts, and drag-and-drop budgets were tightened to match the smaller chunks.
- The validation budget was raised from 65 kB / 17 kB to 85 kB / 24 kB for Zod 4.6. The chunk
  still holds only Zod, so the growth comes from Zod itself rather than a chunk boundary change:
  4.6 adds a parse memoizer for cyclic schemas, ships a larger JSON Schema generator, and bundles
  the English locale by default. Classic schemas wire the JSON Schema processors into every schema
  constructor, so that code cannot be tree-shaken. Moving the shared schemas to `zod/mini`, which
  skips the JSON Schema processors and the default memoizer, is the way to shrink this chunk
  again. React 19.3 grew `react-vendor-*` by about 28 kB raw.
- The live stats became a strip of SVG sparklines, removing Chart.js (about 54 kB gzip) and the
  `charts-*` chunk entirely; the full stats page will use uPlot. The strip, the new header and
  the extracted settings dialog now render with the entry, so its budgets rose from 66 kB / 20 kB
  to 72 kB / 22 kB (JS) and 70 kB / 12 kB to 76 kB / 13 kB (CSS) while the first view as a whole
  lost the chart chunk it used to fetch right after rendering.
- Replacing Recharts with Chart.js cut the chart chunk roughly in half.
- Zod 4 and the schema split moved runtime validation out of the entry bundle.

## When To Update Budgets

- Update the baseline notes after a deliberate chunking change.
- Raise a budget only when the added functionality is justified and documented in the same change.
- Prefer reducing or splitting a chunk before increasing its limit.
