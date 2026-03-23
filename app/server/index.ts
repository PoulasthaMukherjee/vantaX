import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { ensureDatabaseSchema } from './db';
import { injectMeta } from './routeMeta';
import adminRouter from './routes/admin';
import authRouter from './routes/auth';
import auditionsRouter from './routes/auditions';
import candidatesRouter from './routes/candidates';
import companiesRouter from './routes/companies';
import companyFlowRouter from './routes/companyFlow';
import juryRouter from './routes/jury';
import paymentRouter from './routes/payment';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Known SPA routes that should return 200
const SPA_ROUTES = [
  '/',
  '/what-is-vantax',
  '/companies',
  '/companies/start',
  '/jury',
  '/admin',
  '/privacy',
  '/terms',
  '/refund',
  '/dashboard',
];

// Routes with dynamic segments
function isKnownRoute(url: string): boolean {
  const pathname = url.split('?')[0].replace(/\/$/, '') || '/';
  if (SPA_ROUTES.includes(pathname)) return true;
  if (/^\/companies\/draft\/[^/]+$/.test(pathname)) return true;
  if (/^\/companies\/submitted\/[^/]+$/.test(pathname)) return true;
  if (/^\/auditions\/[^/]+$/.test(pathname)) return true;
  if (/^\/auditions\/[^/]+\/round\/[^/]+$/.test(pathname)) return true;
  if (/^\/auditions\/[^/]+\/leaderboard$/.test(pathname)) return true;
  if (/^\/admin\/reviews(\/.*)?$/.test(pathname)) return true;
  if (/^\/admin\/auditions(\/.*)?$/.test(pathname)) return true;
  return false;
}

app.use(compression());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://sdk.cashfree.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://sdk.cashfree.com", "https://api.cashfree.com"],
      frameSrc: ["https://sdk.cashfree.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(cors());

// Permissions-Policy: restrict unused browser features
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Trailing slash redirect → canonical URL without slash
app.use((req, res, next) => {
  if (req.path !== '/' && req.path.endsWith('/')) {
    const clean = req.path.slice(0, -1);
    const query = req.url.slice(req.path.length);
    return res.redirect(301, clean + query);
  }
  next();
});
// Capture raw body for webhook signature verification
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString();
  },
}));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Health check endpoint for Railway
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRouter);
app.use('/api/auditions', auditionsRouter);
app.use('/api/candidates', candidatesRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/company-flow', companyFlowRouter);
app.use('/api/jury', juryRouter);
app.use('/api/admin', adminRouter);
app.use('/api/payment', paymentRouter);

// API 404 — prevent unmatched API routes from falling through to SPA
app.all('/api/*', (_req, res) => res.status(404).json({ error: 'Not found' }));

// SSR render function — loaded at startup if SSR bundle exists
type RenderFn = (url: string) => { html: string; helmet: any };
let ssrRender: RenderFn | null = null;

// Serve Vite build in production
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  // Read index.html once at startup for meta injection
  const indexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');

  // Hashed assets get long-lived cache
  app.use('/assets', express.static(path.join(distPath, 'assets'), {
    maxAge: '1y',
    immutable: true,
  }));
  // Fonts rarely change — long cache
  app.use('/fonts', express.static(path.join(distPath, 'fonts'), {
    maxAge: '1y',
    immutable: true,
  }));
  // Other static files get short cache (index: false so SSR handler serves HTML)
  app.use(express.static(distPath, { maxAge: '1h', index: false }));

  // SSR + meta injection for every page request
  app.get('*', (req, res) => {
    const status = isKnownRoute(req.path) ? 200 : 404;

    // Start with meta-injected HTML (title, OG tags, canonical for social crawlers)
    let html = injectMeta(indexHtml, req.path);

    // If SSR is available, render React app into <div id="root">
    if (ssrRender) {
      try {
        const { html: appHtml } = ssrRender(req.path);
        html = html.replace(
          '<div id="root"></div>',
          `<div id="root">${appHtml}</div>`,
        );
        res.setHeader('X-SSR-Status', 'enabled');
      } catch (err: any) {
        // SSR failure is not fatal — fall back to client-side rendering
        console.error('SSR render error for', req.path, err.message);
        res.setHeader('X-SSR-Status', 'error');
      }
    } else {
      res.setHeader('X-SSR-Status', 'disabled');
    }

    res.status(status).type('html').send(html);
  });
}

async function startServer() {
  // Load SSR module before accepting requests
  const ssrPath = path.join(distPath, 'server', 'entry-server.js');
  if (fs.existsSync(ssrPath)) {
    try {
      const mod = await import(ssrPath);
      ssrRender = mod.render;
      console.log('SSR module loaded');
    } catch (err: any) {
      console.warn('SSR module failed to load, falling back to CSR:', err.message);
    }
  }

  try {
    await ensureDatabaseSchema();
    console.log('Database schema ensured');
  } catch (error) {
    // Keep the site available even if the database is temporarily unreachable.
    console.error('Database schema init failed:', error);
  }

  app.listen(PORT, () => {
    console.log(`VantaX server running on port ${PORT}`);
  });
}

void startServer();
