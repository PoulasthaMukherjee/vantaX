# CLAUDE CODE PROTOCOL (v2)

Use this when coding in this repo. It prioritizes safety, multi-tenancy, and clear handoffs.

## Modes & Rigor
- **Explore**: Sketch to learn (no destructive actions).
- **Solidify**: Build for real (full rigor).

**Rigor Levels**
- **L1 (Trivial)**: Quick checks (ls, view file, run tests expecting failures). Optional DOING/EXPECT inline.
- **L2 (Local)**: Single-file edits, new tests, migrations in dev. Use DOING/EXPECT; batch ≤3 actions, then checkpoint.
- **L3 (High risk)**: Schema changes, deletions, multi-file refactors. DOING/EXPECT + Autonomy check; summarize plan and pause if uncertain.

## Core Checklist (before work)
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
- Never `git add .`; add files intentionally.
- No silent fallbacks; surface errors.
- Respect rate/budget limits; don’t override without approval.
- For irreversible changes: state why safe (Chesterton’s Fence).

**SHOULD**
- Use DOING/EXPECT for L2+.
- Maintain multiple hypotheses when debugging.
- Avoid abstractions before 3 real uses.

## Planning & Decomposition
- Restate: Goal, Inputs, Outputs, Assumptions.
- Make a short numbered plan; mark ✅/🔄/⏸ as you go.

## Handoff Template
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
- Structured logging with context; actionable error messages.
- Tests: at least happy path, edge, failure (where applicable). Behavior-named tests.
- Run formatters/linters/tests; remove dead/unused code.

## Testing Protocol
- One test at a time; run it; observe result. No skipping.
- State which tests ran and results before marking done.

## Context Discipline
- Every ~10 actions, re-read goal/constraints; if lost, stop and restate.
- Batch size ≤3 actions between checkpoints.

## Autonomy Check (for L3)
- Is this what Q wants? If wrong, blast radius? Easily undone? Would Q want to know? If uncertain + consequence, stop and ask.

## Pushback & Contradictions
- Surface conflicts/ambiguous intent; don’t guess. Offer concern + alternative; defer to Q.

## Repo-Specific Reminders
- Multi-tenancy: org header + org filters everywhere; honor org-scoped unique constraints.
- Rate limits/budgets: API/submission caps, per-org LLM budget (warn at 80%, hard stop 100%).
- Worker/LLM: temp=0, token cap (~7k), retry invalid JSON once with stricter prompt, backoff on 429/5xx, provider fallback, log to `llm_usage_log`.
- GitHub validation: SSRF-safe, default branch, repo/file limits, cache metadata, allow PAT if set.
- Points: use documented values and consistency bonus; enforce `points_log` uniqueness.
- Notifications: send scoring complete/failed emails; admin alerts for LLM/queue issues.
- CORS/Secrets: whitelist origins; no secrets in code.
- Testing: Postgres only; cross-org isolation tests; mock/offline scorer harness.
- Do not `tskill node.exe` (Claude code uses node).
