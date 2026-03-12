import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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

app.use('/api/candidates', candidatesRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/company-flow', companyFlowRouter);
app.use('/api/jury', juryRouter);
app.use('/api/admin', adminRouter);
app.use('/api/payment', paymentRouter);

// Serve Vite build in production
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback: serve index.html for non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
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
