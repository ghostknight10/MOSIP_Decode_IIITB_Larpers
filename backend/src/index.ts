import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import proxyGateway from './routes/proxyGateway.js';
import { playgroundRouter } from './routes/playground.js';
import { collabTargets } from './services/collab.js';
import { requireToken } from './middleware/requireToken.js';

dotenv.config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 4000;

// CORS: the UI normally reaches the BFF through the Vite proxy (same origin),
// so only the configured frontend origins may call it directly.
app.use(cors({
  origin: (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(o => o.trim()),
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

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 MOSIP Interoperability BFF listening on port ${PORT}`);
  console.log(`👉 Health check: http://localhost:${PORT}/api/health`);
  console.log(`=======================================================`);
});
