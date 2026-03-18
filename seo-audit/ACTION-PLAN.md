# VantaX SEO Action Plan

**Date:** 2026-03-13
**Current Score:** 68/100
**Target Score:** 85+/100

---

## Critical (Fix Immediately)

### 1. Compress OG Image — `vantax-logo.png` is 6.4 MB
**Impact:** Social sharing completely broken (LinkedIn, Twitter, Facebook timeout on large images)
**Fix:**
- Convert to WebP/AVIF at 1200x630 (OG recommended size)
- Target: <100 KB
- Update `index.html` og:image and twitter:image references
**Files:** `public/brand/vantax-logo.png`, `index.html`

### 2. Inject `og:image` per route in `routeMeta.ts`
**Impact:** All non-homepage pages share the same OG image URL
**Fix:**
- Add `image` field to `RouteMeta` interface
- Add `og:image` replacement in `injectMeta()` function
- Create page-specific OG images (or use a default optimized one)
**Files:** `server/routeMeta.ts`

### 3. Add alt text to ALL images
**Impact:** Only 1/4+ images has alt text — accessibility failure and SEO miss
**Fix:**
- Navbar logo: `alt="VantaHire"`
- Footer logo: `alt="VantaHire — Hiring-first talent platform"`
- Any other images: descriptive alt text
**Files:** `src/components/layout/Navbar.tsx`, footer components

---

## High Priority (Fix Within 1 Week)

### 4. Implement Server-Side Rendering for key pages
**Impact:** Social crawlers and non-JS AI bots can't see page content. LCP is delayed because hero `<img>` isn't in initial HTML.
**Approach (lightweight, no framework migration):**
- Add `renderToString()` from `react-dom/server` for static routes
- Use `StaticRouter` for server route matching
- Use Helmet's `HelmetServerState` to extract meta from render
- Embed rendered HTML in `<div id="root">` instead of empty div
- Switch client to `hydrateRoot()` instead of `createRoot()`
- Embed initial state as `window.__INITIAL_STATE__` if any data fetching is added
**Files:** `server/index.ts`, `src/main.tsx`, new `server/ssr.ts`
**Priority pages:** `/`, `/what-is-vantax`, `/companies`, `/jury`

### 5. Expand thin content pages
**Impact:** /companies (140 words), /what-is-vantax (195 words), /jury (210 words) risk being classified as thin content
**Fix:**
- `/what-is-vantax`: Expand with FAQ section, detailed format explanation, comparison to traditional hiring
- `/companies`: Add benefits list, process steps, pricing details, social proof
- `/jury`: Add jury responsibilities, time commitment, what they gain, selection criteria
**Target:** 500+ words of unique content per page

### 6. Add FAQPage schema to key pages
**Impact:** Rich result eligibility + high AI citation value
**Fix:**
- Add FAQ sections to `/`, `/what-is-vantax`, `/companies`
- Implement FAQPage JSON-LD in `SEO.tsx` extraJsonLd
- Questions like: "What is VantaX?", "How much does it cost?", "When is VantaX 2026?", "Can I use AI tools?", "How are submissions scored?"
**Files:** Page components, `SEO.tsx`

### 7. Add `/what-is-vantax` to main navigation
**Impact:** Currently only discoverable via sitemap — no internal link from navigation
**Fix:** Add to navbar between Home and Companies
**Files:** `src/components/layout/Navbar.tsx`

---

## Medium Priority (Fix Within 1 Month)

### 8. Create `llms.txt` file
**Impact:** AI crawlers can better understand site structure and key content
**Fix:**
```
# VantaX
> India's first structured hiring audition by VantaHire

## About
VantaX is a skills-first hiring platform where candidates solve 3 real-world challenges posted by partner companies...

## Key Pages
- [Home](https://vantax.vantahire.com/)
- [What is VantaX](https://vantax.vantahire.com/what-is-vantax)
- [For Companies](https://vantax.vantahire.com/companies)
- [Join the Jury](https://vantax.vantahire.com/jury)
```
**Files:** New `public/llms.txt`

### 9. Add responsive hero image srcset
**Impact:** Mobile users download 1920px image on 375px screens
**Fix:**
- Generate hero images at 640, 1024, 1440, 1920px widths
- Add `srcset` and `sizes` to `<picture>` element
**Files:** `src/sections/landing/Hero.tsx`, generate new image variants

### 10. Add BreadcrumbList schema to all pages
**Impact:** Currently only on landing page
**Fix:** Add breadcrumbs prop to all `<SEO>` calls
**Files:** All page components

### 11. Add `changefreq` and `priority` to sitemap
**Impact:** Minor — helps crawlers prioritize
**Fix:**
```xml
<url>
  <loc>https://vantax.vantahire.com/</loc>
  <lastmod>2026-03-12</lastmod>
  <changefreq>weekly</changefreq>
  <priority>1.0</priority>
</url>
```
**Files:** `public/sitemap.xml`

### 12. Set explicit Cache-Control for index.html
**Impact:** Currently no cache header on the HTML document
**Fix:** Add `Cache-Control: no-cache` or `max-age=300` for the SPA fallback response
**Files:** `server/index.ts`

---

## Low Priority (Backlog)

### 13. Add HowTo schema for the challenge format
The 3-challenge format is a natural fit for HowTo structured data.

### 14. Add contextual cross-links between content pages
Link from /companies to /jury, from /jury to /what-is-vantax, etc.

### 15. Restrict CORS to known origins
Currently `cors()` with no origin restriction.

### 16. Delete or compress hero-image.png (4.3 MB)
The PNG fallback is only for browsers that don't support AVIF or WebP (essentially none in 2026). Consider removing it or compressing to <500 KB.

### 17. Add testimonials/social proof
Would significantly boost E-E-A-T signals. Even early beta participant quotes would help.

---

## Implementation Order

```
Week 1 (Critical + Quick):
  1. Compress OG image
  2. Add og:image injection per route
  3. Add alt text to all images
  6. Add FAQ sections + FAQPage schema
  7. Add /what-is-vantax to nav

Week 2 (High Impact):
  4. Implement lightweight SSR
  5. Expand thin content pages

Week 3 (Polish):
  8. Create llms.txt
  9. Responsive hero srcset
  10. BreadcrumbList on all pages
  11. Sitemap changefreq/priority
  12. Cache-Control for HTML
```
