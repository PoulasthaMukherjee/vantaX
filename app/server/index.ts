import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { ensureDatabaseSchema } from './db';
import adminRouter from './routes/admin';
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
];

// Routes with dynamic segments
function isKnownRoute(url: string): boolean {
  const pathname = url.split('?')[0].replace(/\/$/, '') || '/';
  if (SPA_ROUTES.includes(pathname)) return true;
  if (/^\/companies\/draft\/[^/]+$/.test(pathname)) return true;
  if (/^\/companies\/submitted\/[^/]+$/.test(pathname)) return true;
  return false;
}

app.use(compression());
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors());
// Capture raw body for webhook signature verification
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString();
  },
}));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Health check endpoint for Railway
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/candidates', candidatesRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/company-flow', companyFlowRouter);
app.use('/api/jury', juryRouter);
app.use('/api/admin', adminRouter);
app.use('/api/payment', paymentRouter);

// API 404 — prevent unmatched API routes from falling through to SPA
app.all('/api/*', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Serve Vite build in production
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  // Hashed assets get long-lived cache
  app.use('/assets', express.static(path.join(distPath, 'assets'), {
    maxAge: '1y',
    immutable: true,
  }));
  // Other static files get short cache
  app.use(express.static(distPath, { maxAge: '1h' }));

  // SPA fallback with proper 404 status for unknown routes
  app.get('*', (req, res) => {
    const status = isKnownRoute(req.path) ? 200 : 404;
    res.status(status).sendFile(path.join(distPath, 'index.html'));
  });
}

async function startServer() {
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
