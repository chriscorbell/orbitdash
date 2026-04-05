# Quality Rubric

Use this rubric during larger refactors, releases, or roadmap checkpoints. Score each area from 0 to 2.

## Scoring

- `0`: materially weak or missing
- `1`: acceptable but incomplete
- `2`: strong and consistently enforced

## Categories

| Category      | What to look for                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Architecture  | Responsibilities are separated cleanly, shared contracts are intentional, and maintainability hotspots are understood. |
| Tests         | Unit, integration, and higher-level smoke coverage protect the main user and server flows.                             |
| Resilience    | Validation, failure handling, and shutdown behavior are explicit and operationally safe.                               |
| Performance   | Bundle budgets, query/index choices, and runtime loops are measured rather than assumed.                               |
| Documentation | Setup, release, backup, and architecture decisions are current and actionable.                                         |

## Interpreting The Total

- `0-3`: not ready for significant change without cleanup
- `4-6`: workable but carrying visible quality debt
- `7-8`: strong foundation with a few targeted gaps
- `9-10`: production-ready and well-maintained

## Review Habit

- Re-score after roadmap milestones or major feature additions.
- Record the reasons for any `0` or `1` score in the PR or release notes.
- Prefer one concrete follow-up item per low-scoring category instead of a vague improvement list.
