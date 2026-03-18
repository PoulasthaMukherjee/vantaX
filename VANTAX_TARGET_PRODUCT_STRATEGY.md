# Vantax Target Product Strategy

**Date:** 2026-03-13  
**Purpose:** Define what Vantax should become, what it should avoid becoming, and the strategic tradeoffs of the current architecture direction.

---

## 1. Recommended Product Target

Vantax should target a **structured hiring audition platform**, not a generic hackathon platform and not a broad hiring operations suite.

The product should stay centered on this core loop:

1. A company shares one real hiring problem.
2. Vantax converts it into a 3-round audition.
3. Candidates complete Round 1 and Round 2 in a structured execution flow.
4. Vantax scores, reviews, and ranks candidates.
5. Companies see only the top finalists.
6. Final interviews or hiring decisions happen after the audition signal is established.

### Core positioning

Vantax should be:

- real-problem hiring, not generic coding tests
- structured and repeatable, not chaotic event management
- shortlist-oriented, not a giant talent marketplace
- human-moderated, not AI-only hiring automation
- hiring-first, not branding-first

### Best one-line product target

**Vantax helps companies hire by watching candidates solve real problems from their product.**

---

## 2. What Vantax Should Build Toward

### Primary target

Build a **narrow, opinionated hiring product** with these core capabilities:

- company problem intake
- AI-assisted audition generation
- candidate registration and authenticated execution flow
- Round 1 and Round 2 submission handling
- AI diagnostic scoring through `vibe`
- Vantax-owned leaderboard filtering
- Vantax-owned human review workflow
- finalist handoff to company

### Product shape to preserve

The best Vantax shape is:

- Vantax as the only UI
- Firebase-based candidate auth on Vantax
- `vibe` as internal rounds 1-2 execution and scoring engine
- Vantax as source of truth for:
  - audition state
  - round unlock logic
  - review state
  - leaderboard visibility
  - final rubric
  - finalist selection

### Why this target is strong

This is strong because it creates a clear differentiator:

- Unstop-like platforms optimize for events at scale
- ATS platforms optimize for workflow and pipeline management
- coding test platforms optimize for screening
- Vantax can own the gap between them:
  **real company problem -> structured execution -> hiring shortlist**

---

## 3. What Vantax Should Not Do

Vantax should not become a generic clone of Unstop, HackerEarth, or a full ATS.

### Anti-goals

- Do not become a generic hackathon/event management tool.
- Do not lead with community scale, gamification, or branding events.
- Do not build a giant employer operating system before the audition flow works.
- Do not expose `vibe` directly to candidates or companies.
- Do not position the product as “host a competition.”
- Do not let the product drift into “resume database + assessments + interviews + offers + HRMS” too early.
- Do not make AI the final decision-maker.
- Do not optimize for vanity metrics such as registrations without conversion to shortlist/hire.

### Product mistakes to avoid

- broad contest platform messaging
- open-ended hackathon tooling
- too many event formats
- too much custom configurability too early
- AI-only scoring without human moderation
- raw leaderboard exposure without Vantax rules
- treating docs or README as the only evidence in code assessment
- forcing candidates into a second product surface (`vibe`)

---

## 4. What We Are Actually Building

Given the current codebase and architecture direction, Vantax is best understood as:

### A hiring shell around an internal execution engine

- Vantax handles:
  - company intake
  - candidate journey
  - auth
  - round access
  - submissions
  - review workflow
  - finalist decisions
- `vibe` handles:
  - event structure for Round 1 and Round 2
  - assessment storage
  - file/repo submission processing
  - AI diagnostic scoring
  - raw event leaderboard

This is the right split because `vibe` already has event, submission, and scoring infrastructure, but Vantax owns the product thesis and hiring workflow.

---

## 5. Pros of This Approach

### Strategic pros

- **Clear differentiation:** Vantax is not “another assessment platform.” It is a hiring-audition product.
- **Real signal:** Real company problems create stronger hiring evidence than generic coding tests.
- **Lower company noise:** The model is naturally aligned to “show me finalists, not applicants.”
- **Higher defensibility:** The combination of company context, structured rounds, and human-reviewed scoring is harder to commoditize.
- **Focused product scope:** Avoids trying to build an ATS, event engine, and sourcing network all at once.

### Product pros

- Stronger candidate story than resume-based filtering
- Better company narrative than “run a hackathon”
- Easier to explain internally: one company problem -> two execution rounds -> finalists
- Works well for startup and product teams that care about practical signal

### Technical pros

- Reuses existing `vibe` strengths instead of rebuilding event/submission/scoring from scratch
- Keeps Vantax UI and business rules independent
- Makes rollout modular:
  - auth
  - auditions
  - submissions
  - review
  - leaderboard

---

## 6. Cons and Risks of This Approach

### Strategic cons

- The category may need explanation because “hiring audition” is not a mature default buying category.
- Companies may still confuse the product with hackathons if messaging slips.
- The model is narrower than broad hiring suites, so some buyers may ask for ATS/interview tooling earlier than desired.

### Product risks

- Round design quality becomes a core product dependency.
- If company problem generation is weak, the whole product feels generic.
- If the review process is slow, the audition loses its speed advantage.
- If the leaderboard or rubric feels opaque, trust drops for both candidates and companies.

### Technical risks

- Vantax and `vibe` integration adds complexity around identity, sync, and reliability.
- `vibe` scoring is useful but not yet perfectly aligned to Vantax’s final rubric.
- multi-file code assessment still needs context-quality improvements
- webhook, idempotency, and sync failures must be handled carefully

---

## 7. SWOT Analysis

### Strengths

- Distinct product thesis: hiring by seeing real work
- Stronger signal than resume screening
- Stronger realism than generic coding tests
- Existing `vibe` engine reduces time to execution for rounds 1-2
- Human-in-the-loop scoring makes the model more trustworthy
- Good fit for startups, dev tools teams, AI teams, and product-led engineering hiring

### Weaknesses

- Requires careful company problem design
- Needs more operational sophistication than a simple form-based hiring site
- Requires reviewer workflow to maintain quality
- Current Vantax codebase is still pre-execution and needs major platform additions
- Depends on clean sync between Vantax and `vibe`

### Opportunities

- Own the “real-problem hiring audition” category
- Replace take-home + early screening for small and mid-sized tech teams
- Become the preferred high-signal hiring layer for early-career and practical builders
- Add company-specific finalist dashboards later without becoming a bloated ATS
- Build strong network effects around repeat hiring partners and trusted rubric/reviewer quality

### Threats

- Broad platforms like Unstop can imitate parts of the workflow
- coding assessment platforms can add “real project” positioning
- ATS vendors can bolt on assessment stages and claim similar workflow coverage
- if AI scoring quality is weak or inconsistent, trust can erode quickly
- if the product drifts into generic contest tooling, it loses differentiation

---

## 8. Recommended Strategic Rules

These rules should guide product decisions:

- Keep the homepage candidate-first.
- Keep `/companies` company-first.
- Keep the message centered on hiring, not events.
- Keep `vibe` internal.
- Keep humans in final scoring and finalist decisions.
- Keep Round 1 light, Round 2 substantive, Round 3 human-led.
- Keep the leaderboard as a Vantax-controlled output, not a raw contest ranking.
- Keep company effort low: “share context, we do the work.”
- Keep code as the primary evidence in scoring; docs and explanations are supporting context.

---

## 9. Recommended Near-Term Target

The correct near-term target is not “build everything Unstop has.”

The correct near-term target is:

### Vantax v1

- company creates or approves an audition
- candidate signs in to Vantax
- candidate completes Round 1 and Round 2 in Vantax
- `vibe` scores submissions and provides raw leaderboard inputs
- Vantax reviewers approve final rubric scores
- Vantax produces finalists for company review

That is enough to validate the core product.

### Not needed in v1

- full ATS replacement
- interview scheduling suite
- employer branding campaign system
- marketplace-style community growth engine
- broad event template system
- heavy custom reporting layer

---

## 10. Final Recommendation

Vantax should target being the **best structured hiring audition product**, not the broadest hiring platform.

That means:

- build depth, not breadth
- protect the “real problem” differentiator
- use `vibe` as infrastructure, not as the product surface
- keep human-reviewed hiring signal at the center

If the product works, the moat will not come from having the most features. It will come from having the most credible and repeatable path from **real work -> trustworthy shortlist -> real hiring outcome**.
