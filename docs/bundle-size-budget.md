# Bundle Size Budget

Orbitdash uses manual Vite chunking for the main runtime, React vendor code, Chart.js, drag and
drop dependencies, and lazily loaded dialogs. Those chunks now have explicit bundle budgets.

## Current Budgets

| Asset group          | Budget raw | Budget gzip | Current baseline                |
| -------------------- | ---------: | ----------: | ------------------------------- |
| `index-*.js`         |     145 kB |       45 kB | about 115 kB raw / 34.9 kB gzip |
| `index-*.css`        |      70 kB |       12 kB | about 61 kB raw / 10.8 kB gzip  |
| `react-vendor-*.js`  |     230 kB |       75 kB | about 224 kB raw / 70.5 kB gzip |
| `charts-*.js`        |     180 kB |       65 kB | about 163 kB raw / 56.8 kB gzip |
| `validation-*.js`    |      85 kB |       24 kB | about 82 kB raw / 23.1 kB gzip  |
| `ServiceDialog-*.js` |     100 kB |       28 kB | about 33 kB raw / 10.3 kB gzip  |
| `drag-drop-*.js`     |      55 kB |       18 kB | about 47 kB raw / 15.2 kB gzip  |

## How To Check

```bash
npm run build
npm run bundle:check
```

The check reads the built files in `dist/assets`, calculates raw and gzip sizes, and fails if any
tracked chunk crosses its budget. The validation chunk keeps Zod-based runtime parsing out of the
main entry bundle while preserving a dedicated ceiling for schema-related growth. The current
baseline reflects the Zod 4 migration and the follow-on schema split that kept validation logic
isolated from the main entry bundle. The entry raw budget was rebaselined from 140 kB to 145 kB for
the Radix UI 1.6 update; its 45 kB gzip ceiling remains unchanged. Replacing Recharts with Chart.js
cut the chart chunk roughly in half and allowed its raw and gzip limits to be tightened.

The validation budget was raised from 65 kB / 17 kB to 85 kB / 24 kB for Zod 4.6. The chunk still
holds only Zod, so the growth comes from Zod itself rather than a chunk boundary change: 4.6 adds
a parse memoizer for cyclic schemas, ships a larger JSON Schema generator, and bundles the English
locale by default. Classic schemas wire the JSON Schema processors into every schema constructor, so
that code cannot be tree-shaken. Moving the shared schemas to `zod/mini`, which skips the JSON
Schema processors and the default memoizer, is the way to shrink this chunk again. React
19.3 grew `react-vendor-*` by about 28 kB raw but stays within its existing budget.

## When To Update Budgets

- Update the baseline notes after a deliberate chunking change.
- Raise a budget only when the added functionality is justified and documented in the same change.
- Prefer reducing or splitting a chunk before increasing its limit.
