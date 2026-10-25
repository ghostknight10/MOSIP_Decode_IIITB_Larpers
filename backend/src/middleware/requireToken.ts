import { timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

/**
 * Optional shared secret for the BFF (S-2). When PLAYGROUND_TOKEN is set, every
 * /api route except /api/health needs a matching x-playground-token header.
 * The Vite dev server adds it to proxied requests, so the browser never sees
 * it and the BFF port can't be used directly. Unset, the BFF stays open.
 */
export function requireToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.PLAYGROUND_TOKEN;
  if (!expected || req.path === '/api/health') return next();
  const given = req.headers['x-playground-token'];
  const ok =
    typeof given === 'string' &&
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (ok) return next();
  return res.status(401).json({ success: false, error: 'Missing or wrong x-playground-token' });
}
