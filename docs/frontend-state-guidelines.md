# Frontend Async State Guidelines

Orbitdash has two async surface areas that users notice immediately: the stats section and the
services section. Both should always communicate one of four clear states.

## State Rules

- Loading: show section chrome plus a visible status card that explains what is being fetched.
- Success: remove transient notices and show the live or saved data normally.
- Empty: explain why the section is empty and give the user a next action when one exists.
- Error: keep the last known good data visible when possible; otherwise replace the section body
  with a retryable error card.

## Current Mapping

- Stats: `connecting` is the loading state, live samples are the success state, and `offline` or a
  failed initial fetch renders an explicit warning or error card.
- Services: initial fetch shows a loading card, an empty collection shows the empty-state call to
  action, search misses show the search empty state, and fetch failures show either a blocking
  retry card or a non-blocking stale-data warning.

## Contributor Checklist

- Preserve section headings and layout while data is loading.
- Avoid blank placeholders with no explanatory copy.
- Prefer non-blocking warnings when stale data is still useful.
- Add or update tests when state transitions change.
