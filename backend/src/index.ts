import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { playgroundRouter } from './routes/playground.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global Request Logging Middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`[BFF] ${timestamp} | ${req.method} ${req.originalUrl}`);
  next();
});

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'mosip-playground-bff',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    collabSandbox: {
      injiCertify: process.env.MOSIP_INJI_CERTIFY_URL || 'https://certify.collab.mosip.net',
      mimoto: process.env.MOSIP_MIMOTO_URL || 'https://mimoto.collab.mosip.net',
      injiVerify: process.env.MOSIP_INJI_VERIFY_URL || 'https://verify.collab.mosip.net'
    }
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
