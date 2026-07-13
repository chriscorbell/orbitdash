# Bundle Size Budget

Orbitdash uses manual Vite chunking for the main runtime, React vendor code, Chart.js, drag and
drop dependencies, and lazily loaded dialogs. Those chunks now have explicit bundle budgets.

## Current Budgets

| Asset group          | Budget raw | Budget gzip | Current baseline                |
| -------------------- | ---------: | ----------: | ------------------------------- |
| `index-*.js`         |     145 kB |       45 kB | about 141 kB raw / 43 kB gzip   |
| `index-*.css`        |      70 kB |       12 kB | about 61 kB raw / 10.8 kB gzip  |
| `react-vendor-*.js`  |     230 kB |       75 kB | about 196 kB raw / 62.4 kB gzip |
| `charts-*.js`        |     180 kB |       65 kB | about 163 kB raw / 56.8 kB gzip |
| `validation-*.js`    |      65 kB |       17 kB | about 63 kB raw / 16.9 kB gzip  |
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

## When To Update Budgets

- Update the baseline notes after a deliberate chunking change.
- Raise a budget only when the added functionality is justified and documented in the same change.
- Prefer reducing or splitting a chunk before increasing its limit.
