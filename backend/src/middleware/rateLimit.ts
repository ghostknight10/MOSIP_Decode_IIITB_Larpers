import { NextFunction, Request, Response } from 'express';

/**
 * Small in-memory fixed-window limiter for the public, unauthenticated issuer
 * endpoints (/api/oid4vci), which sign a credential per request. Keyed by
 * client IP (behind a proxy, enable `trust proxy`). One process only; fine for
 * a playground, not a substitute for a gateway's rate limiting.
 */
export function rateLimit({ windowMs = 60_000, max = 30 }: { windowMs?: number; max?: number } = {}) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    const key = req.ip ?? 'unknown';
    const entry = hits.get(key) ?? { count: 0, resetAt: now + windowMs };
    entry.count += 1;
    hits.set(key, entry);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'too_many_requests', error_description: 'Rate limit exceeded; try again shortly.' });
    }
    return next();
  };
}
