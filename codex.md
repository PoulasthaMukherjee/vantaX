# CODEX PROTOCOL (v2)

Use this when coding in this repo (FastAPI/React/RQ, multi-tenant). Keep outputs concise, safe, and human-like.

## Modes & Rigor
- **Explore**: quick sketch to learn (no destructive actions).
- **Solidify**: real implementation (full rigor).

**Rigor Levels**
- **L1 (Trivial)**: list files, view snippets, run tests expecting failures. Optional DOING/EXPECT inline.
- **L2 (Local)**: single-file edits, new tests, dev migrations. Use DOING/EXPECT; batch ≤3 actions, then checkpoint.
- **L3 (High risk)**: schema changes, deletions, multi-file refactors. DOING/EXPECT + autonomy check; pause if uncertain.

## Core Checklist
- Goal (1 sentence)
- Constraints (time, blast radius, tech)
- First small experiment (DOING/EXPECT)
- Checkpoint cadence (e.g., every 3 actions)

## Explicit Reasoning (for L2/L3)
Before action:
```
DOING: [action]
EXPECT: [predicted outcome]
IF YES: [...]
IF NO: [...]
```
After action:
```
RESULT: [what happened]
MATCHES: [yes/no]
THEREFORE: [next action or stop]
```

## Failure Handling (MUST)
- On failure: words first, no silent retries.
- Report: what failed (raw error), theory why, proposed next action + expected outcome; ask to proceed if high risk.

## MUST vs SHOULD
**MUST**
- Always include `organization_id` filters/headers; no cross-tenant leaks.
- No `git add .`; add files intentionally.
- No silent fallbacks; surface errors.
- Respect rate/budget limits; do not override without approval.
- Explain removals/behavior changes (Chesterton’s Fence).

**SHOULD**
- Use DOING/EXPECT for L2+.
- Keep multiple hypotheses when debugging.
- Avoid abstractions before 3 real uses.

## Planning & Handoff
- Restate: Goal, Inputs, Outputs, Assumptions.
- Short numbered plan; mark ✅/🔄/⏸ as you go.
- Handoff template:
```
HANDOFF
GOAL: [...]
STATE: Done [...]; In progress [...]; Not started [...]
BLOCKERS: [...]
OPEN QUESTIONS: [...]
NEXT ACTIONS: 1) ... 2) ...
FILES TOUCHED: path1, path2
```

## Code Style (Human-like)
- Small functions; clear names (what over how).
- Comments/docstrings for why/contract, not restating code.
- Structured logging with context; actionable errors.
- Tests: happy path, edge, failure where applicable; behavior-named.
- Run formatters/linters/tests; remove dead/unused code.

## Testing Protocol
- One test at a time; run it; observe result. No skipping.
- State which tests ran and results before marking done.
- Use Postgres in tests/CI (no SQLite); include cross-org isolation tests; mock/offline scorer harness.

## Context Discipline
- Every ~10 actions, re-read goal/constraints; if lost, stop and restate.
- Batch size ≤3 actions between checkpoints.

## Autonomy Check (for L3)
- Is this what the user wants? If wrong, blast radius? Undoable? Would the user want to know? If uncertain + consequence, stop and ask.

## Pushback & Contradictions
- Surface conflicts/ambiguous intent; don’t guess. Offer concern + alternative; defer to user.

## Repo-Specific Reminders
- Multi-tenancy: org header + org filters everywhere; honor org-scoped unique constraints.
- Rate limits/budgets: API/submission caps, per-org LLM budget (warn 80%, hard stop 100%).
- Worker/LLM: temp=0, token cap (~7k), retry invalid JSON once with stricter prompt, backoff on 429/5xx, provider fallback, log to `llm_usage_log`.
- GitHub validation: SSRF-safe, default branch, repo/file limits, cache metadata, allow PAT if set; ignore/minified rules.
- Points: use documented values and consistency bonus; enforce `points_log` uniqueness.
- Notifications: send scoring complete/failed emails; admin alerts for LLM/queue issues.
- CORS/Secrets: whitelist origins; no secrets in code.
- Do not `tskill node.exe` (Claude code uses node).
