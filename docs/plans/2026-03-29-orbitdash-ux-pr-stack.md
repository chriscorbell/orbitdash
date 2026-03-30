# orbitdash UX PR Stack Plan

> For Hermes: execute this as a focused PR stack, one branch/PR at a time, keeping each change narrowly scoped and easy to review.

Goal: Improve orbitdash’s usability, discoverability, and perceived polish without turning the dashboard into a larger feature rewrite.

Architecture: Start with low-risk UX wins that mostly touch the frontend and avoid backend/schema changes. Ship in reviewable layers: onboarding and discoverability first, then card and category polish, then richer metrics and future operational features.

Tech Stack: React 19, TypeScript, TailwindCSS v4, shadcn/ui, Vite, Bun, Hono, SQLite.

---

## PR 1: Onboarding and empty-state improvements

Objective: Make first-run and low-content states feel intentional, welcoming, and self-explanatory.

Scope:
- Replace the bare empty state in `src/components/ServicesSection.tsx` with a richer onboarding panel.
- Add a primary “Add your first service” CTA.
- Add lightweight guidance for what users can store in orbitdash.
- Add a few suggested example categories/services as static hints only (no import logic yet).
- Improve the “no search results” state so it offers a quick way to clear search.

Non-goals:
- No backend presets/import.
- No changes to service persistence or data model.

Acceptance criteria:
- A brand-new install feels clearly guided instead of blank.
- Search-empty state offers a recovery path.
- The page still feels lightweight and not overly tutorial-heavy.

Files likely touched:
- `src/components/ServicesSection.tsx`
- optionally a new small onboarding component under `src/components/services/`

---

## PR 2: Toolbar clarity and primary actions

Objective: Make the top-level actions easier to understand at a glance.

Scope:
- Convert the add-service action into a labeled primary button on desktop.
- Improve labels/tooltips/aria text for layout and reorder controls.
- Make search + actions feel like a single, coherent toolbar.
- Consider a slightly clearer header action for stats/services order.

Acceptance criteria:
- A first-time user can identify the primary action immediately.
- Icon-only ambiguity is reduced.

Files likely touched:
- `src/components/services/ServicesToolbar.tsx`
- `src/components/Header.tsx`

---

## PR 3: Service card discoverability and polish

Objective: Make service cards easier to scan and manage.

Scope:
- Improve edit/manage affordance so it’s more discoverable than hover-only.
- Tighten card spacing and hierarchy.
- Improve fallback icon treatment and hover/focus states.
- Consider showing the destination hostname or a subtle external-link hint.

Acceptance criteria:
- Users can discover how to manage a service without guessing.
- Cards remain visually clean but feel more purposeful.

Files likely touched:
- `src/components/ServiceCard.tsx`
- `src/components/services/CategorySectionList.tsx`

---

## PR 4: Category hierarchy improvements

Objective: Make grouped services easier to browse.

Scope:
- Strengthen category headings.
- Add service counts per category.
- Improve spacing and section separation.
- Optionally add collapsible categories only if it stays simple.

Acceptance criteria:
- Category groups are easier to scan than they are today.
- The screen feels less like one long uniform list of cards.

Files likely touched:
- `src/components/services/CategorySectionList.tsx`
- `src/components/services/CategorySection.tsx` if introduced

---

## PR 5: Metrics summary improvements

Objective: Make the metrics area more informative without major backend changes.

Scope:
- Show absolute RAM/disk values where possible.
- Improve the readability of stat cards.
- Consider making the chart controls easier to parse.
- Keep the existing lightweight metrics approach.

Acceptance criteria:
- Users can understand system state from the cards alone.
- The chart feels like a helpful drill-down rather than the only way to interpret stats.

Files likely touched:
- `src/components/MetricCard.tsx`
- `src/components/MetricCharts.tsx`
- `shared/types.ts`
- any metrics mapping code if needed

---

## PR 6: Docs and product consistency cleanup

Objective: Align documentation and product behavior.

Scope:
- Fix README inaccuracies (for example, grid column count mismatch).
- Refresh screenshots if earlier PRs visibly change the UI.
- Document the improved onboarding behavior.

Acceptance criteria:
- README matches shipped behavior.
- Visual examples don’t lag behind the actual app.

Files likely touched:
- `README.md`
- `.github/images/preview.png`

---

## Future PRs after the initial UX stack

These should stay separate because they cross into product/operational functionality:
- Service health/status indicators
- Favorites/pinning
- Import/export or starter templates with real data seeding
- Mobile-specific interaction pass
- Response-time, uptime, or last-checked telemetry

---

## Recommended implementation order

1. PR 1 — onboarding and empty-state improvements
2. PR 2 — toolbar clarity and primary actions
3. PR 3 — service card polish
4. PR 4 — category hierarchy
5. PR 5 — metrics summary improvements
6. PR 6 — docs consistency cleanup

---

## Current execution target

Start with PR 1 on a dedicated branch. Keep it frontend-only, avoid schema changes, and verify with:

```bash
cd ~/projects/orbitdash
export PATH="$HOME/.bun/bin:$PATH"
bun run lint
bun run build
```
