# VantaX Brand Guidelines

Last derived from the website codebase on 2026-03-11.

This document is based on the current redesigned VantaX website in `app/src`, shared styles in `app/src/index.css`, metadata in `app/index.html`, email styling in `app/server/emailTemplates.ts`, and brand assets in `app/public/brand`.

Use this as the working brand system for marketing documents, decks, PDFs, one-pagers, social creative, event collateral, and outbound content.

## 1. Brand Essence

### Brand name

- Primary brand spelling: `VantaX`
- Parent brand: `VantaHire`
- Product relationship: `VantaX by VantaHire`

### Short brand definition

VantaX is a structured hiring audition built to replace resume filtering for early-career talent.

### Core promise

Real companies post real problems. Candidates solve them under constraint. Execution becomes the signal.

### Positioning statement

VantaX is positioned as a hiring-first, execution-scored alternative to resumes, DSA screens, and spectacle-driven hackathons.

### Audience groups reflected in the site

- Early-career builders: final-year students, recent graduates, 0-2 years experience
- Hiring companies: especially product, SaaS, AI, automation, and startup teams
- Jury members: operators, builders, hiring leaders, domain experts

## 2. Messaging Architecture

### Primary positioning lines

Use these lines frequently. They are repeated across the site and form the clearest messaging spine.

- `India's first structured hiring audition`
- `3 challenges. 2 hours each. Prove it.`
- `A structured hiring audition — built to replace resume filtering.`
- `Your college brand won't matter here. Your execution will.`
- `Built for the AI-native generation.`
- `Human decisions, AI acceleration.`

### Core narrative

The site consistently tells the same story:

1. Hiring is broken.
2. Resumes do not measure execution.
3. DSA puzzles do not measure real-world thinking.
4. Hackathons optimize for presentation and team dynamics, not precision.
5. AI has changed how builders work, so hiring should evaluate judgment with AI, not avoidance of AI.
6. VantaX creates a structured, comparable, execution-based hiring signal.

### Functional proof points

- Company-sourced real problems
- 3 independent challenges
- 2-hour time-box per challenge
- Individual participation
- AI tools encouraged
- Standardized rubric scoring
- AI pre-score with human moderation
- Direct hiring pipeline for top performers
- Transparent, integrity-focused evaluation

### Brand pillars for marketing documents

- `Execution over credentials`
- `Structure over noise`
- `Hiring over spectacle`
- `AI-native, not AI-avoidant`
- `Transparent scoring`

## 3. Tone of Voice

### Voice attributes

- Direct
- Sharp
- High-conviction
- Technical
- Minimal
- Anti-fluff
- Outcome-oriented

### How the brand sounds

The website copy reads like an operator, not a lifestyle brand. It uses short, declarative lines, contrast statements, and strong framing. It is confident without sounding corporate or academic.

### Writing rules

- Prefer short sentences.
- Lead with the point, not context.
- Use contrast: `not X, Y instead`.
- Speak in verbs: `solve`, `prove`, `submit`, `evaluate`, `hire`.
- Keep claims concrete and process-based.
- Treat AI as a tool for execution, not a threat or gimmick.
- Sound rigorous, not inspirational.

### Good copy patterns

- `Real companies post real problems.`
- `Work speaks for itself.`
- `See the work before the interview.`
- `Clean signal. Zero noise.`
- `Transparent scoring. No guesswork.`

### Avoid

- Generic startup hype
- Corporate HR jargon
- Motivational language
- Overly polished ad-speak
- Claims that imply luck, networking, or pedigree matter more than performance

### Recommended CTA language

- `Register for VantaX`
- `Apply for VantaX 2026`
- `Submit a Problem`
- `Join the Jury`
- `Learn How It Works`
- `See the Format`

### CTA language to avoid

- `Join the revolution`
- `Unlock your potential`
- `Transform your future`
- `Experience innovation`

## 4. Visual Identity

### Overall visual direction

The redesign is a dark, terminal-inspired interface with selective neon accents and minimal glass effects. It should feel:

- precise
- technical
- credible
- modern
- AI-native
- a little underground, not mass-market glossy

The visual system is intentionally restrained. Purple and gold do the heavy lifting. Everything else exists to support legibility and signal seriousness.

### Design motifs

- terminal syntax
- command-line references
- code-like labels such as `const`, `//`, `$`, `~/vantax`, and `--register`
- subtle scanlines
- faint grid overlays
- radial glow/vignette backgrounds
- thin technical borders
- dashed separators

## 5. Color System

These are the current source-of-truth tokens from `app/src/index.css`.

### Primary palette

- Background: `#0F0D15`
- Secondary dark background: `#0D0B14`
- Primary text: `#E4E4E7`
- Secondary text: `#A1A1AA`
- Muted text: `#52525B`

### Brand accents

- Purple 400: `#C084FC`
- Purple 500: `#A855F7`
- Purple 600: `#7C3AED`
- Gold 400: `#FDE047`
- Gold 500: `#FACC15`
- Gold 600: `#EAB308`
- Pink accent: `#F472B6`
- Blue accent: `#60A5FA`
- Success green: `#4ADE80`

### UI support colors

- Card fill: `rgba(168, 130, 255, 0.03)`
- Card hover fill: `rgba(168, 130, 255, 0.08)`
- Border: `rgba(168, 130, 255, 0.10)`
- Subtle border: `rgba(168, 130, 255, 0.15)`
- Hover border: `rgba(168, 130, 255, 0.30)`
- Purple glow: `rgba(168, 130, 255, 0.15)`
- Gold glow: `rgba(250, 204, 21, 0.30)`

### Color roles

- Purple = system, structure, intelligence, interface language
- Gold = action, emphasis, value, conversion points
- Pink = critique, problem framing, broken-system callouts
- Green = validation, confirmation, success states
- Blue = optional secondary highlight, use sparingly

### Recommended usage ratio

- 70% dark background tones
- 20% neutral text and linework
- 7% purple accents
- 3% gold accents

Gold should be scarce enough to still feel like a high-value cue.

### For print/light-background documents

The website is dark-first, but marketing PDFs may need light versions. If you adapt to light backgrounds:

- Use off-white, not pure white
- Keep purple as the system accent
- Keep gold for highlights and CTA bars only
- Preserve strong contrast and terminal motifs
- Do not turn the brand into a generic SaaS white deck

Suggested light adaptation:

- Background: `#F7F7FA`
- Surface: `#FFFFFF`
- Primary text: `#15131D`
- Secondary text: `#5A5865`
- Purple 500: `#A855F7`
- Gold 500: `#FACC15`

This light palette is inferred for document production; it is not explicitly defined in code.

## 6. Typography

### Primary typeface

- `JetBrains Mono`

### Fallback stack in code

- `"JetBrains Mono", "Space Mono", monospace`

### Typography character

The brand is mono-first. This is unusual for marketing collateral, but it is central to the current redesign. Preserve the coding/terminal feel in headings, labels, tables, and CTA areas.

### Typography rules

- Use JetBrains Mono everywhere by default in digital collateral.
- Use bold weights for headlines and stat callouts.
- Use uppercase with tracking for labels, overlines, metadata, and section tags.
- Keep body copy short and narrow. The site rarely uses long, wide paragraphs.

### Approximate website hierarchy

- Hero H1: large, bold, tight leading, high contrast
- Section H2: bold, compact, often with left border or label row
- Label text: 12px to 13px uppercase/tracked
- Body copy: 13px to 15px
- Microcopy: 12px to 13px
- Stats: large numeric emphasis in gold

### Document typography guidance

- Deck title: 36-48 pt JetBrains Mono Bold
- Section title: 20-28 pt JetBrains Mono Bold
- Label/eyebrow: 9-11 pt uppercase tracked
- Body: 10-12 pt for PDFs, 12-14 pt for web assets
- Data/stats: 24-40 pt bold depending on layout

## 7. Logo and Brand Asset Guidance

### Current assets in repo

- VantaX icon: `app/public/brand/vantax-logo.png`
- VantaHire logo: `app/public/brand/vantahire-logo-white.svg`

### What the current site actually does

The website itself mostly uses a text-based terminal wordmark in the navbar: `~/vantax` with a blinking gold cursor. The PNG logo asset is used for favicon and social preview metadata, not as the main UI header lockup.

### Practical brand rule

Use two logo modes depending on context:

- `Product UI mode`: text wordmark or terminal-styled `VantaX`
- `Marketing / cover mode`: the VantaX symbol asset and/or VantaX wordmark

### VantaX mark characteristics

From the current PNG asset, the logo communicates:

- purple folded ribbon or chevron form on the left
- gold circuit-board styled `X` on the right
- dark background
- high-tech, asymmetric composition

### Logo usage guidance

- Prefer dark backgrounds behind the logo
- Give the symbol generous clear space
- Do not place the gold side over noisy imagery
- Do not flatten the logo into pastel or muted colorways
- Do not use random gradient substitutes that drift from purple/gold
- If only text is available, write `VantaX` in JetBrains Mono Bold

### Clear space recommendation

Use at least the width of the purple ribbon stroke as minimum clear space on all sides.

### Minimum size

- Digital icon use: 24 px minimum
- Presentation/doc cover use: 72 px minimum
- Social/OG use: 160 px+ preferred

## 8. Layout System

### Website layout cues

The site centers most content inside a `1000px` max-width container, with generous vertical spacing and narrow readable columns.

### Layout characteristics

- centered composition
- strong vertical rhythm
- modular blocks/cards
- thin separators
- dense but readable information groupings
- minimal corner softness

### Document layout rules

- Use rigid columns and rows
- Keep asymmetry subtle, not chaotic
- Build pages from panels, cards, timelines, rubric bars, and stat bands
- Use dashed or faint dividers to segment information
- Preserve whitespace around hero statements and key numbers

### Grid guidance for collateral

- Slides: 12-column grid
- One-pagers/PDFs: 6-column or 12-column grid
- Margins: 48-72 px for slides, 24-40 px for one-pagers
- Section spacing: generous; avoid crowded pages

## 9. Component Language

Marketing documents should borrow from the website's recurring component grammar.

### Reusable motifs

- terminal label rows: `const`, `//`, `$`, braces, command flags
- bordered cards with dark translucent fill
- left-accent borders
- stat strips with numeric gold emphasis
- comparison tables
- timeline rows
- rubric bars
- dashed-outline CTA blocks

### Buttons

Primary button:

- Gold fill
- Dark text
- Bold uppercase mono text
- Slight glow on hover

Secondary button:

- Transparent/dark fill
- Purple border
- Purple text

Ghost button:

- Mostly text-only
- Muted by default
- Gold on hover

### Corners and borders

- Corners are mostly sharp to lightly rounded
- Borders are thin and low-contrast
- Hover states increase border visibility more than fill intensity

## 10. Motion and Interaction

### Motion style on the site

- slow fade/slide reveals
- subtle vertical motion
- restrained glow pulses
- blinking cursor motif
- animated stat counts
- no bouncy or playful motion language

### Marketing motion guidance

- Use reveal motion, not spectacle
- Favor fades, slides, and line-growth
- Keep durations around `0.5s-0.8s`
- Use easing that feels smooth and deliberate
- Avoid overshoot, elastic bounce, or flashy 3D transitions

For static docs, imply motion through composition: cursor marks, progress bars, timelines, sequential numbering.

## 11. Iconography and Illustration

### Icon style

The site uses `lucide-react` icons, which means the brand currently favors:

- line icons
- geometric forms
- simple stroke-based visuals
- technical clarity over decoration

### Icon usage guidance

- Use line icons, not filled cartoon icons
- Keep icon color single-tone per use case
- Purple for system/structure
- Gold for action/value
- Pink for problem/broken-state framing
- Keep icon sizes modest

### Illustration guidance

- Prefer diagrams, flows, brackets, grids, arrows, rubric bars, and circuit references
- Avoid stock 3D people, generic teamwork art, or soft blob illustrations
- Use abstract technical surfaces if imagery is needed

## 12. Photography and Imagery

The current redesign is largely non-photographic. Marketing materials should stay mostly system-led.

### Preferred imagery

- dark technical gradients
- interface closeups
- diagrams
- code-like overlays
- abstract circuitry
- structured talent or scoring visuals

### Avoid

- smiling office teams
- handshake shots
- campus stock photography
- generic laptop coffee images
- noisy hacker clichés

## 13. Messaging by Audience

### For candidates

Lead with:

- execution over pedigree
- real-world problems
- AI tools allowed
- internship and hiring exposure
- fair, transparent scoring

Best candidate lines:

- `Your execution becomes your resume.`
- `Work speaks for itself.`
- `Any language. Any framework. Any AI tool.`
- `This is a hiring audition, not a coding trivia test.`

### For companies

Lead with:

- stop screening resumes
- see candidates solve your actual problem
- rubric-scored comparability
- no campus logistics
- faster shortlist turnaround

Best company lines:

- `Stop screening 500 resumes.`
- `See the work before the interview.`
- `Execution-ranked candidates.`
- `7-day turnaround from challenge to shortlist.`

### For jury

Lead with:

- review only top shortlisted work
- structured rubric
- shape a new hiring standard
- evaluate real execution under constraint

Best jury lines:

- `Interpret the signal.`
- `Review real submissions, not portfolios built over months.`
- `Help define how early-career builders get evaluated.`

## 14. Event-Specific Facts in Current Code

These details are present in the current website and can be used in 2026 marketing material. One timeline note on the site says dates are tentative, so treat them as campaign copy, not permanent evergreen brand facts.

### Event framing

- Event name: `VantaX 2026`
- Geography: India
- Mode: fully online
- Registration fee: `INR 199 + GST`

### Current timeline in code

- Registration opens: `2026-03-09`
- Jury and partner announcement: `2026-04-14`
- Event launch: `2026-04-23`
- Challenge 1: `2026-04-25`
- Challenge 2: `2026-04-27`
- Challenge 3: `2026-04-29`
- Top 10 + final results: `2026-05-01`

### Current participation framing

- 3 challenges
- 2 hours each
- AI tools encouraged
- individual format
- top performers mapped to internship or entry-level pipelines

## 15. Marketing Document Templates

### One-pager

Structure:

1. Hero statement
2. What VantaX is
3. Why it exists
4. How it works
5. Scoring/integrity
6. CTA

Visual treatment:

- dark background
- single hero line in white with gold emphasis
- purple labels
- gold CTA bar
- card-based fact blocks

### Company sales deck

Recommended slide flow:

1. Title: `Stop screening resumes.`
2. Hiring problem statement
3. Why current filters fail
4. What VantaX is
5. How company-sourced challenges work
6. Scoring and integrity
7. What companies receive
8. Turnaround and hiring outcomes
9. Submission CTA

### Candidate launch PDF

Recommended sections:

1. `3 challenges. 2 hours each. Prove it.`
2. Why VantaX exists
3. What will be evaluated
4. Submission format
5. Eligibility
6. Timeline
7. Pricing
8. Register CTA

### Social posts/carousels

Use punchy contrast-led frames:

- `Resumes don't measure execution.`
- `DSA doesn't measure real-world thinking.`
- `Hackathons reward presentation.`
- `VantaX measures the work.`

### Outbound email / PDF memo style

Use the lighter email adaptation already present in `app/server/emailTemplates.ts` as a fallback for clients that do not support the full website look. Keep:

- dark body background
- purple headers
- gold highlights
- simple card sections
- restrained typography

## 16. Copy Bank

### Headline bank

- `3 challenges. 2 hours each. Prove it.`
- `Structured hiring. Real signal.`
- `Execution over credentials.`
- `Built to replace resume filtering.`
- `See the work before the interview.`
- `Clean signal. Zero noise.`
- `Hackathons were built for spectacle. VantaX is built for hiring.`

### Subheadline bank

- `Real companies post real problems. Candidates solve them under constraint.`
- `AI tools encouraged. Judgment required.`
- `A hiring-first format for the AI-native generation.`
- `Structured, comparable, execution-based evaluation for early-career talent.`

### Proof phrases

- `AI pre-score + human moderation`
- `Rubric-scored submissions`
- `Individual execution`
- `Company-sourced problems`
- `Transparent audit trail`
- `7-day turnaround`

## 17. Do / Don't

### Do

- Use dark backgrounds with high contrast text
- Let purple and gold remain the dominant accents
- Keep copy short and decisive
- Use mono typography prominently
- Build layouts from technical modules and panels
- Treat the brand as rigorous and hiring-first

### Don't

- Turn VantaX into a friendly pastel campus brand
- Use soft corporate HR language
- Overuse gradients or neon glows
- Add playful illustrations or mascot logic
- Replace the mono typography with generic sans serif unless required by a specific output constraint
- Make the brand feel like a hackathon, bootcamp, or generic assessment platform

## 18. Source of Truth and Gaps

### Source-of-truth items

- colors and font stack from `app/src/index.css`
- metadata and event framing from `app/index.html`
- messaging and positioning from `app/src/lib/constants.ts` and page sections
- email-safe fallback styling from `app/server/emailTemplates.ts`
- logo assets from `app/public/brand`

### Inferred items in this document

- print/light-theme adaptations
- clear-space recommendation
- minimum logo sizes
- some layout recommendations for decks and PDFs

These inferred rules are consistent with the redesign, but they are not explicitly codified in the app.
