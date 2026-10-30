import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import proxyGateway from './routes/proxyGateway.js';
import { playgroundRouter } from './routes/playground.js';
import { oid4vciRouter } from './routes/oid4vci.js';
import { collabTargets } from './services/collab.js';
import { requireToken } from './middleware/requireToken.js';

// The repo-root .env (shared with docker compose), or backend/.env; the first wins per variable.
dotenv.config({
  quiet: true,
  path: [path.resolve(__dirname, '../.env'), path.resolve(__dirname, '../../.env')]
});

const app = express();
const PORT = process.env.PORT || 4000;

// CORS: only the configured origins ('*' opts in to any). Unset means same-origin
// only, which is all the single-container deployment (BFF serving the UI) needs.
const corsOrigin = process.env.FRONTEND_URL
  ? (process.env.FRONTEND_URL === '*' ? true : process.env.FRONTEND_URL.split(',').map(o => o.trim()))
  : false;
// Behind Render / a reverse proxy, req.ip must be the client's, for rate limiting.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-transaction-id', 'x-playground-token']
}));

// Credentials and presentations are a few KB; 1 MB leaves ample headroom.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Global Request Logging Middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`[BFF] ${timestamp} | ${req.method} ${req.originalUrl}`);
  next();
});

// Optional shared token (PLAYGROUND_TOKEN); /api/health stays open for health checks.
app.use(requireToken);

// Proxy gateway (after the logger, so proxied calls are logged too)
app.use('/', proxyGateway);

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'mosip-playground-bff',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    collabSandbox: (({ certify, mimoto, verify }) => ({ injiCertify: certify, mimoto, injiVerify: verify }))(collabTargets())
  });
});

// Playground Routes
app.use('/api/playground', playgroundRouter);

// Standard OpenID4VCI Issuer Endpoints (for external mobile wallets scanning QR)
app.use('/api/oid4vci', oid4vciRouter);
app.use('/.well-known', oid4vciRouter);

// In production, serve static frontend assets if built
const frontendDistCandidates = [
  path.resolve(__dirname, 'public'),
  path.resolve(__dirname, '../../frontend/dist'),
  path.resolve(__dirname, '../frontend/dist'),
  path.resolve(process.cwd(), 'frontend/dist'),
  path.resolve(process.cwd(), '../frontend/dist')
];
const frontendDist = frontendDistCandidates.find(dir => fs.existsSync(dir));

if (frontendDist) {
  console.log(`[BFF] Serving frontend static assets from: ${frontendDist}`);
  app.use(express.static(frontendDist));
  // Client-side SPA routing fallback for requests that don't match /api
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: `Not found: ${req.path}` });
    }
    res.sendFile(path.resolve(frontendDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 MOSIP Interoperability BFF listening on port ${PORT}`);
  console.log(`👉 Health check: http://localhost:${PORT}/api/health`);
  console.log(`=======================================================`);
});
