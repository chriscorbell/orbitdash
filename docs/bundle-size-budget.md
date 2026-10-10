# Bundle Size Budget

Orbitdash splits the build into the app entry, React, the other third-party code the first render
needs, Chart.js, drag and drop, Zod, and lazily loaded dialogs. Those chunks have explicit bundle
budgets.

## Chunk Layout

Chunking is configured with Rolldown's `codeSplitting.groups` in `vite.config.ts` (the replacement
for the deprecated `manualChunks`). A group also captures the dependencies of the modules it
matches, so group priority decides where shared packages land:

1. `react-vendor`: React, React DOM, and the scheduler. It has the highest priority so that no
   other group pulls React in as a dependency.
2. `validation`: Zod only. The app's own schemas ship in the entry, so this chunk's hash only
   changes when Zod does.
3. `charts`: Chart.js and react-chartjs-2. Only the lazily loaded `MetricCharts` imports it.
4. `drag-drop`: dnd-kit. Only the lazily loaded settings `CategoryOrderList` imports it.
5. `icons`: lucide-react.
6. `vendor`: everything else in `node_modules` that the first render needs (Radix, Floating UI,
   tailwind-merge). The `$initial` tag keeps packages used only by lazy chunks, like the Select
   and Tabs primitives, inside those chunks.

The entry chunk then holds only app code, so a typical app change invalidates about 12 kB of
brotli instead of the vendor code too.

`charts-*` and `drag-drop-*` must never be loaded up front. If React lands in one of them again,
or an always-loaded module imports dnd-kit or Chart.js directly, the entry starts importing that
chunk statically and `index.html` modulepreloads it. `npm run bundle:check` fails when that
happens.

## Current Budgets

| Asset group          | Budget raw | Budget gzip | Current baseline                             |
| -------------------- | ---------: | ----------: | -------------------------------------------- |
| `index-*.js`         |      55 kB |       16 kB | about 46 kB raw / 13.7 kB gzip / 12.2 kB br  |
| `index-*.css`        |      70 kB |       12 kB | about 63 kB raw / 10.9 kB gzip / 9.5 kB br   |
| `react-vendor-*.js`  |     200 kB |       63 kB | about 185 kB raw / 57.6 kB gzip / 49.6 kB br |
| `vendor-*.js`        |     135 kB |       43 kB | about 119 kB raw / 38.1 kB gzip / 33.4 kB br |
| `charts-*.js`        |     170 kB |       60 kB | about 156 kB raw / 54.2 kB gzip / 47.6 kB br |
| `validation-*.js`    |      65 kB |       17 kB | about 63 kB raw / 16.9 kB gzip / 15.0 kB br  |
| `ServiceDialog-*.js` |     100 kB |       28 kB | about 33 kB raw / 10.3 kB gzip / 9.3 kB br   |
| `drag-drop-*.js`     |      48 kB |       16 kB | about 43 kB raw / 14.1 kB gzip / 12.7 kB br  |

Sizes are in KiB, as printed by the check script.

## How To Check

```bash
npm run build
npm run bundle:check
```

`npm run build` ends with `scripts/compress-assets.mjs`, which writes `.br` and `.gz` siblings next
to every text asset of 512 bytes or more. The server sends those precompressed files to browsers
that accept them.

The check reads the built files in `dist/assets` and fails if:

- any tracked chunk crosses its raw or gzip budget
- a tracked chunk is missing its `.br` or `.gz` sibling
- `dist/index.html` references a `charts-*` or `drag-drop-*` chunk

## History

- The entry budget was cut from 145 kB raw / 45 kB gzip to 55 kB / 16 kB when third-party UI code
  moved into `vendor-*`. The old `manualChunks` setup put React inside `charts-*`, so the entry
  imported Chart.js and dnd-kit statically and `index.html` preloaded both. React vendor, charts,
  and drag-and-drop budgets were tightened to match the smaller chunks.
- Replacing Recharts with Chart.js cut the chart chunk roughly in half.
- Zod 4 and the schema split moved runtime validation out of the entry bundle.

## When To Update Budgets

- Update the baseline notes after a deliberate chunking change.
- Raise a budget only when the added functionality is justified and documented in the same change.
- Prefer reducing or splitting a chunk before increasing its limit.
