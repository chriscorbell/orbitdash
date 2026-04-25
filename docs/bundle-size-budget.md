# Bundle Size Budget

Orbitdash uses manual Vite chunking for the main runtime, React vendor code, Recharts, drag and
drop dependencies, and lazily loaded dialogs. Those chunks now have explicit bundle budgets.

## Current Budgets

| Asset group          | Budget raw | Budget gzip | Current baseline               |
| -------------------- | ---------: | ----------: | ------------------------------ |
| `index-*.js`         |     140 kB |       45 kB | about 126 kB raw / 40 kB gzip  |
| `index-*.css`        |      70 kB |       12 kB | about 60 kB raw / 11 kB gzip   |
| `react-vendor-*.js`  |     230 kB |       75 kB | about 216 kB raw / 69 kB gzip  |
| `charts-*.js`        |     350 kB |      105 kB | about 334 kB raw / 100 kB gzip |
| `validation-*.js`    |      65 kB |       17 kB | about 61 kB raw / 16.5 kB gzip |
| `ServiceDialog-*.js` |     100 kB |       28 kB | about 87 kB raw / 23 kB gzip   |
| `drag-drop-*.js`     |      55 kB |       18 kB | about 45 kB raw / 15 kB gzip   |

## How To Check

```bash
npm run build
npm run bundle:check
```

The check reads the built files in `dist/assets`, calculates raw and gzip sizes, and fails if any
tracked chunk crosses its budget. The validation chunk keeps Zod-based runtime parsing out of the
main entry bundle while preserving a dedicated ceiling for schema-related growth. The current
baseline reflects the Zod 4 migration and the follow-on schema split that kept validation logic
isolated from the main entry bundle.

## When To Update Budgets

- Update the baseline notes after a deliberate chunking change.
- Raise a budget only when the added functionality is justified and documented in the same change.
- Prefer reducing or splitting a chunk before increasing its limit.
