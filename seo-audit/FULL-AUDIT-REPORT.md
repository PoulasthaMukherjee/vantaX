# VantaX SEO Audit Report

**Site:** https://vantax.vantahire.com/
**Date:** 2026-03-13
**Business Type:** B2B/B2C Hybrid — Online Assessment / Hiring Audition Platform
**Pages Crawled:** 8 indexable + 2 dynamic + 1 admin (blocked)

---

## Executive Summary

### Overall SEO Health Score: 68 / 100

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Technical SEO | 78/100 | 25% | 19.5 |
| Content Quality | 55/100 | 25% | 13.8 |
| On-Page SEO | 72/100 | 20% | 14.4 |
| Schema / Structured Data | 80/100 | 10% | 8.0 |
| Performance (CWV) | 70/100 | 10% | 7.0 |
| Images | 40/100 | 5% | 2.0 |
| AI Search Readiness | 60/100 | 5% | 3.0 |
| **Total** | | | **67.7** |

### Top 5 Critical Issues

1. **OG image is 6.4 MB** — social crawlers will timeout fetching `vantax-logo.png` (512x512, uncompressed PNG). LinkedIn/Twitter/Facebook previews will break.
2. **No SSR — SPA body is empty `<div id="root"></div>`** — Googlebot renders JS fine, but social crawlers and some AI bots only see `<noscript>` fallback. The real page content (sections, CTAs, forms) is invisible without JavaScript.
3. **Only 1 image has alt text** in the entire codebase — the hero image. All brand logos lack alt attributes.
4. **Thin content on most pages** — /companies (~140 words), /what-is-vantax (~195 words), /jury (~210 words). Google's helpful content system flags pages under ~300 words.
5. **No `og:image` injection for non-homepage routes** — `routeMeta.ts` replaces title/description/URL but never updates `og:image`. Every page shares the homepage OG image URL.

### Top 5 Quick Wins

1. Compress `vantax-logo.png` from 6.4 MB → <100 KB (or serve WebP/AVIF)
2. Add `og:image` per-route in `routeMeta.ts`
3. Add alt text to all logo/brand images in components
4. Add `changefreq` and `priority` to sitemap.xml
5. Create `llms.txt` file (you already allow AI crawlers in robots.txt)

---

## 1. Technical SEO (78/100)

### Crawlability ✅ Good

| Check | Status | Notes |
|-------|--------|-------|
| robots.txt | ✅ | Well-configured. Blocks /api/, /uploads/, /admin. Allows AI crawlers. |
| Sitemap | ✅ | 8 URLs, referenced in robots.txt. Valid XML. |
| Sitemap in robots.txt | ✅ | `Sitemap: https://vantax.vantahire.com/sitemap.xml` |
| Internal linking | ⚠️ | Nav links to /, /companies, /jury only. No cross-links to /what-is-vantax, /privacy, /terms, /refund from main nav. |
| URL structure | ✅ | Clean, lowercase, no parameters. |
| Trailing slash handling | ✅ | 301 redirect to canonical (no trailing slash). |

### Indexability ✅ Good

| Check | Status | Notes |
|-------|--------|-------|
| Canonical tags | ✅ | Server-injected for all 8 routes via `routeMeta.ts`. Client-side via Helmet as backup. |
| noindex usage | ✅ | Only on 404 page — correct. |
| Duplicate content | ✅ | No duplicate issues detected. |
| HTTP status codes | ✅ | Known routes return 200, unknown return 404. |
| API 404 catch-all | ✅ | `/api/*` returns JSON 404, doesn't fall through to SPA. |

### Security Headers ✅ Strong

| Header | Status | Notes |
|--------|--------|-------|
| Content-Security-Policy | ✅ | Restrictive. Only allows Cashfree SDK externally. |
| X-Frame-Options | ✅ | Set by helmet (SAMEORIGIN default). |
| X-Content-Type-Options | ✅ | nosniff via helmet. |
| Permissions-Policy | ✅ | Custom: camera=(), microphone=(), geolocation=(). |
| HSTS | ✅ | Via helmet defaults. |
| CORS | ⚠️ | Broad `cors()` — consider restricting to known origins. |

### URL Structure ✅ Clean

- `/` — Landing
- `/what-is-vantax` — Explainer
- `/companies` — Company landing
- `/companies/start` — Company onboarding
- `/jury` — Jury recruitment
- `/privacy`, `/terms`, `/refund` — Legal

### JavaScript Rendering ⚠️ Key Gap

- **Architecture:** Pure SPA (React 18 + Vite), no SSR
- **Client entry:** `createRoot()` — correct for CSR, but no server-rendered markup
- **HTML body:** Empty `<div id="root"></div>` + `<noscript>` fallback
- **Noscript content:** Good — contains H1, description, pricing, and links (crawlable by non-JS bots)
- **Impact:** Googlebot handles JS rendering well. Social crawlers (Facebook, LinkedIn, Twitter) do NOT — they only see server-injected meta tags, which are properly handled.
- **Gap:** AI crawlers that don't render JS (some modes of GPTBot, PerplexityBot) will miss page content despite being allowed in robots.txt.

### 404 Handling ✅ Good

- Server returns HTTP 404 status for unknown routes
- Client renders custom NotFoundPage with `noindex` meta
- Good UX with navigation back to home

---

## 2. Content Quality (55/100)

### E-E-A-T Assessment

| Signal | Status | Notes |
|--------|--------|-------|
| Experience | ⚠️ | No testimonials, case studies, or user stories |
| Expertise | ⚠️ | No team bios, credentials, or thought leadership |
| Authoritativeness | ✅ | Organization schema with VantaHire, LinkedIn link |
| Trustworthiness | ✅ | Privacy policy, terms, refund policy, company address (Bangalore), contact email |

### Content Depth Per Page

| Page | Word Count | Assessment |
|------|-----------|------------|
| `/` (Landing) | ~400 | ✅ Adequate — hero, stats, format, rubric, timeline, CTA, registration |
| `/what-is-vantax` | ~195 | ❌ **Thin** — needs expansion |
| `/companies` | ~140 | ❌ **Very thin** — needs significant expansion |
| `/companies/start` | ~100 | ⚠️ Form-heavy page — acceptable for its purpose |
| `/jury` | ~210 | ❌ **Thin** — needs expansion |
| `/privacy` | ~800+ | ✅ Good |
| `/terms` | ~800+ | ✅ Good |
| `/refund` | ~400+ | ✅ Good |

### Readability

- Content is clear and direct
- Good use of developer-friendly language and metaphors ("vantax --register", terminal aesthetic)
- Technical jargon is appropriate for target audience (early-career engineers)

### AI Citation Readiness ⚠️

- Content is well-structured with clear sections
- Missing: FAQ sections (highly citable), comparison tables, definitive statements
- No `llms.txt` file despite allowing AI crawlers

---

## 3. On-Page SEO (72/100)

### Title Tags ✅ Good

| Page | Title | Length | Assessment |
|------|-------|--------|------------|
| `/` | VantaX 2026 — 3 Challenges. 2 Hours Each. \| Hiring Audition | 60 chars | ✅ |
| `/what-is-vantax` | What Is VantaX? — A Structured Hiring Audition \| VantaX 2026 | 62 chars | ✅ |
| `/companies` | For Companies — Hire Engineers by Seeing Them Solve Your Problem \| VantaX 2026 | 79 chars | ⚠️ Slightly long |
| `/companies/start` | Run a Hiring Audition \| VantaX 2026 | 36 chars | ✅ |
| `/jury` | Join the Jury — Review Real-World Submissions \| VantaX 2026 | 60 chars | ✅ |

All titles are unique and keyword-rich. Server-injected correctly.

### Meta Descriptions ✅ Good

All 8 routes have unique, descriptive meta descriptions (120-160 chars). Server-injected.

### Heading Structure ⚠️ Issues

| Page | H1 | Issue |
|------|-----|-------|
| `/` | "3 challenges. 2 hours each. Prove it." | ✅ Good, but H1 is inside JS — only visible after client render |
| `/what-is-vantax` | Same H1 as landing? | ⚠️ Should be unique per page |
| `/companies` | Same H1 pattern | ⚠️ Check if unique |
| `/jury` | Same H1 pattern | ⚠️ Check if unique |

**Noscript H1:** "VantaX 2026 — India's Structured Hiring Audition" — good for non-JS crawlers.

### Open Graph Tags ⚠️ Partial

| Property | Status | Notes |
|----------|--------|-------|
| og:title | ✅ | Server-injected per route |
| og:description | ✅ | Server-injected per route |
| og:url | ✅ | Server-injected per route |
| og:type | ✅ | "website" (set in index.html) |
| og:site_name | ✅ | "VantaX by VantaHire" |
| og:image | ❌ | **Not updated per route** — always points to homepage logo (6.4 MB PNG!) |
| og:locale | ✅ | "en_IN" |

### Twitter Card Tags ⚠️ Partial

| Property | Status | Notes |
|----------|--------|-------|
| twitter:card | ✅ | "summary_large_image" |
| twitter:title | ✅ | Server-injected per route |
| twitter:description | ✅ | Server-injected per route |
| twitter:image | ❌ | **Not updated per route** — same 6.4 MB PNG |

### Internal Linking ⚠️ Needs Improvement

- Navbar links: `/`, `/companies`, `/jury`
- Missing from main nav: `/what-is-vantax`
- Footer links to VantaHire and LinkedIn (external)
- No contextual cross-links between content pages
- `/what-is-vantax` is only discoverable via sitemap, not navigation

---

## 4. Schema / Structured Data (80/100)

### Current Implementation ✅ Good Foundation

**In `index.html` (server-rendered, visible to all crawlers):**

1. **Organization** — VantaHire, Bangalore, logo, founding date, LinkedIn, contact email
2. **Event** — VantaX 2026, April 25-29, online, ₹199 INR, organized by VantaHire
3. **WebSite** — VantaX, publisher = VantaHire, inLanguage = en-IN

**In SEO.tsx (client-rendered via Helmet):**

4. **WebPage** per route — name, description, URL, isPartOf WebSite
5. **BreadcrumbList** — used on landing page

### Validation Issues

| Schema | Issue |
|--------|-------|
| Event | ✅ Valid — has all required properties (name, startDate, location, offers) |
| Organization | ⚠️ Missing `telephone`, `email` should be in `contactPoint` not standalone |
| WebSite | ✅ Valid |
| WebPage | ✅ Valid — but only rendered client-side (Helmet) |
| BreadcrumbList | ⚠️ Only on landing page — should be on all pages |

### Missing Schema Opportunities

| Schema Type | Where | Impact |
|-------------|-------|--------|
| **FAQPage** | /what-is-vantax, / | High — rich result eligibility, AI citation ready |
| **HowTo** | / (Format section) | Medium — step-by-step format is a natural fit |
| **Offer** | /companies | Medium — pricing for company participation |
| **Review/AggregateRating** | / | Low — when testimonials are available |
| **Course** (or similar) | / | Low — could frame the audition as educational |

### Rich Results Eligibility

| Type | Current | Potential |
|------|---------|-----------|
| Event | ✅ Eligible | Already well-structured |
| FAQ | ❌ Missing | High potential — many FAQ-like sections exist in content |
| Breadcrumb | ⚠️ Client-only | Move to server for guaranteed display |
| Sitelinks | ✅ Possible | Good site structure supports it |

---

## 5. Performance / Core Web Vitals (70/100)

### Bundle Sizes (gzipped over wire)

| Asset | Size (gzip) | Notes |
|-------|------------|-------|
| index.js | 19 KB | Main app code — ✅ Good |
| vendor-router.js | 52 KB | React Router — ⚠️ Largest chunk |
| vendor-motion.js | 37 KB | Framer Motion — lazy pages reduce impact |
| index.css | ~10 KB | Tailwind — ✅ Good |
| **Total critical path** | **~118 KB** | ✅ Good for SPA |

### Font Loading ✅ Excellent

| Aspect | Status |
|--------|--------|
| Self-hosted | ✅ Eliminates DNS/TLS to Google Fonts |
| Preloaded | ✅ Inter Latin + JetBrains Mono |
| font-display: swap | ✅ Text visible immediately |
| Size-adjust fallback | ✅ Reduces CLS on swap |
| Font sizes | ✅ Inter: 48KB + 84KB, JetBrains: 31KB |

### Images ❌ Major Issues

| Image | Size | Issue |
|-------|------|-------|
| hero-image.avif | 36 KB | ✅ Excellent |
| hero-image.webp | 92 KB | ✅ Good fallback |
| hero-image.png | 4.3 MB | ❌ Fallback is massive (rare browsers only) |
| **vantax-logo.png** | **6.4 MB** | ❌ **CRITICAL — used as OG image!** |
| noise-texture.png | 30 KB | ✅ Fine |

### LCP (Largest Contentful Paint) ⚠️

- **Likely LCP element:** Hero image (`<picture>` with AVIF/WebP)
- **Preloaded:** ✅ `<link rel="preload" as="image" type="image/avif" href="/hero-image.avif" fetchpriority="high" />`
- **Issue:** LCP is blocked on JS execution since the `<picture>` element is rendered by React, not in the initial HTML. The preload helps but the actual `<img>` element doesn't exist until React mounts.

### CLS (Cumulative Layout Shift) ✅ Good

- Font fallback with `size-adjust` prevents text reflow
- Hero image has explicit `width={1920} height={1080}` — preserves aspect ratio
- Suspense fallback is minimal (single line of text)

### INP (Interaction to Next Paint) ✅ Likely Good

- No heavy event handlers detected
- Forms use standard controlled inputs
- Framer Motion animations are GPU-accelerated

### Caching Strategy ✅ Good

| Resource | Cache | Notes |
|----------|-------|-------|
| /assets/* | 1 year, immutable | ✅ Hashed filenames |
| Other static | 1 hour | ✅ Reasonable |
| index.html | No cache header | ⚠️ Should have `no-cache` or short TTL |

---

## 6. Images (40/100)

### Alt Text Coverage ❌ Poor

| Image | Alt Text | Status |
|-------|----------|--------|
| Hero image | "VantaX 2026 structured hiring audition" | ✅ |
| VantaHire logo (navbar) | None | ❌ |
| VantaHire logo (footer) | None | ❌ |
| Brand images | None | ❌ |

**Only 1 out of ~4+ images has alt text.**

### Format Optimization ⚠️

- Hero: AVIF + WebP with `<picture>` element — ✅ Excellent
- Logo PNG (6.4 MB): ❌ Must be compressed or converted
- No lazy loading needed — only hero image is above fold, and it correctly uses `fetchPriority="high"` instead

### Responsive Images ⚠️

- Hero image is served at full 1920x1080 regardless of viewport
- Consider `srcset` with multiple sizes for mobile (375px wide doesn't need 1920px image)

---

## 7. AI Search Readiness (60/100)

### AI Crawler Access ✅ Good

| Bot | robots.txt | Status |
|-----|-----------|--------|
| GPTBot | Allow: / | ✅ |
| ChatGPT-User | Allow: / | ✅ |
| ClaudeBot | Allow: / | ✅ |
| anthropic-ai | Allow: / | ✅ |
| PerplexityBot | Allow: / | ✅ |
| Google-Extended | Allow: / | ✅ |
| Applebot-Extended | Allow: / | ✅ |

### llms.txt ❌ Missing

No `llms.txt` file exists. This is increasingly important for AI crawlers to understand site structure and key content.

### Citability Score ⚠️ Medium

| Factor | Status |
|--------|--------|
| Clear, factual statements | ✅ Good |
| FAQ-style Q&A sections | ❌ Missing |
| Definitive pricing/dates | ✅ Good (₹199, April 25-29) |
| Step-by-step processes | ✅ Good (3-challenge format) |
| Comparison/context | ❌ Missing (vs. traditional hiring, vs. other platforms) |
| Author/source attribution | ⚠️ Minimal |

### Content Accessibility to AI ⚠️

- SPA content requires JS rendering — some AI bots may not execute JS
- `<noscript>` fallback provides basic content but not full page content
- Schema markup (Organization, Event) is in initial HTML — ✅ always accessible

---

## Appendix: File Inventory

### Server-Side SEO Files
- `server/routeMeta.ts` — Per-route meta injection (8 routes)
- `server/index.ts` — Express with helmet, compression, SPA fallback, 404 handling

### Client-Side SEO Files
- `src/components/SEO.tsx` — Helmet-based meta + JSON-LD
- `src/pages/*.tsx` — Each page uses `<SEO>` component

### Static SEO Files
- `public/robots.txt` — Crawler directives
- `public/sitemap.xml` — 8 URLs
- `index.html` — Base template with OG tags, Twitter cards, 3 JSON-LD schemas, font loading

### Image Assets
- `public/hero-image.{avif,webp,png}` — Hero background
- `public/brand/vantax-logo.png` — Logo (6.4 MB!)
- `public/brand/vantahire-logo-white.svg` — VantaHire logo
- `public/brand/favicon-32.png`, `apple-touch-icon.png` — Favicons
- `public/noise-texture.png` — Background texture
