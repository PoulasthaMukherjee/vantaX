const BASE_URL = 'https://vantax.vantahire.com';
const DEFAULT_OG_IMAGE = `${BASE_URL}/brand/vantax-og.jpg`;

interface RouteMeta {
  title: string;
  description: string;
  noindex?: boolean;
}

const ROUTE_META: Record<string, RouteMeta> = {
  '/': {
    title: "VantaX 2026 — 3 Challenges. 2 Hours Each. | Hiring Audition",
    description: "India's first structured hiring audition. 3 challenges, 2 hours each. Real companies post real problems. You solve them. Top performers are introduced to partner companies. Starts April 2026.",
  },
  '/what-is-vantax': {
    title: 'What Is VantaX? — A Structured Hiring Audition | VantaX 2026',
    description: 'VantaX replaces the broken resume-to-interview pipeline. Real companies post real problems. You solve them individually — 3 challenges, 2 hours each, AI tools encouraged.',
  },
  '/companies': {
    title: 'For Companies — Hire Engineers by Seeing Them Solve Your Problem | VantaX 2026',
    description: 'Share your hiring context. VantaX creates an AI-assisted draft hiring audition, screens candidates, and brings you the top finalists to interview.',
  },
  '/companies/start': {
    title: 'Run a Hiring Audition | VantaX 2026',
    description: 'Verify your work email, share your hiring context, and generate an AI-assisted draft hiring audition tailored to your company.',
  },
  '/jury': {
    title: 'Join the Jury — Review Real-World Submissions | VantaX 2026',
    description: 'Become a VantaX jury member. Review top submissions from early-career builders solving real business problems. Help identify who gets shortlisted.',
  },
  '/privacy': {
    title: 'Privacy Policy | VantaX 2026',
    description: 'How VantaX collects, uses, and protects your personal information during the structured hiring audition.',
  },
  '/terms': {
    title: 'Terms of Service | VantaX 2026',
    description: 'Terms and conditions for participating in VantaX, India\'s structured hiring audition platform by VantaHire.',
  },
  '/refund': {
    title: 'Refund Policy | VantaX 2026',
    description: 'VantaX refund and cancellation policy for the \u20B9199 registration fee. Full refund available up to 48 hours before event launch.',
  },
  // Dynamic routes — noindex to prevent indexing user-specific draft/submission pages
  '/companies/draft': {
    title: 'Draft Hiring Audition | VantaX 2026',
    description: 'Review and edit your AI-generated draft hiring audition.',
    noindex: true,
  },
  '/companies/submitted': {
    title: 'Submission Confirmed | VantaX 2026',
    description: 'Your hiring audition has been submitted to VantaX.',
    noindex: true,
  },
};

/**
 * Given the raw index.html and a request path, return HTML with
 * per-page <title>, meta description, OG tags, Twitter tags, canonical URL,
 * and og:image injected. Social crawlers (Facebook, LinkedIn, Twitter)
 * don't execute JS, so these must be in the initial HTML response.
 */
export function injectMeta(html: string, pathname: string): string {
  const clean = pathname.replace(/\/$/, '') || '/';

  // Match static routes first, then dynamic route prefixes
  const meta = ROUTE_META[clean]
    || (clean.startsWith('/companies/draft/') ? ROUTE_META['/companies/draft'] : null)
    || (clean.startsWith('/companies/submitted/') ? ROUTE_META['/companies/submitted'] : null);

  // Unknown routes (404s) — keep default homepage meta
  if (!meta) return html;

  const url = `${BASE_URL}${clean === '/' ? '' : clean}`;

  // Replace <title>
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtml(meta.title)}</title>`,
  );

  // Replace meta description
  html = html.replace(
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${escapeAttr(meta.description)}" />`,
  );

  // Replace OG tags
  html = html.replace(
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${escapeAttr(meta.title)}" />`,
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${escapeAttr(meta.description)}" />`,
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${escapeAttr(url)}" />`,
  );
  html = html.replace(
    /<meta property="og:image" content="[^"]*" \/>/,
    `<meta property="og:image" content="${escapeAttr(DEFAULT_OG_IMAGE)}" />`,
  );

  // Replace Twitter tags
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`,
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`,
  );
  html = html.replace(
    /<meta name="twitter:image" content="[^"]*" \/>/,
    `<meta name="twitter:image" content="${escapeAttr(DEFAULT_OG_IMAGE)}" />`,
  );

  // Replace canonical link
  html = html.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
  );
  // If no canonical exists, inject before </head>
  if (!html.includes('<link rel="canonical"')) {
    html = html.replace(
      '</head>',
      `    <link rel="canonical" href="${escapeAttr(url)}" />\n  </head>`,
    );
  }

  // Inject hreflang tags (self-referencing en-IN + x-default)
  if (!meta.noindex) {
    html = html.replace(
      '</head>',
      `    <link rel="alternate" hreflang="en-IN" href="${escapeAttr(url)}" />\n    <link rel="alternate" hreflang="x-default" href="${escapeAttr(url)}" />\n  </head>`,
    );
  }

  // Inject noindex for pages that need it
  if (meta.noindex) {
    html = html.replace(
      '</head>',
      `    <meta name="robots" content="noindex, nofollow" />\n  </head>`,
    );
  }

  return html;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
