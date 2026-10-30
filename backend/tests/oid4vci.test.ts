import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { oid4vciRouter } from '../src/routes/oid4vci.js';
import { rateLimit } from '../src/middleware/rateLimit.js';
import { ldpProofProblem } from '../src/mocks/crypto.js';

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/oid4vci', oid4vciRouter);
  server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/oid4vci`;
});
afterAll(() => server.close());

describe('public OpenID4VCI issuer endpoints', () => {
  it('advertises itself at its own URL, with both formats', async () => {
    const meta: any = await (await fetch(`${base}/.well-known/openid-credential-issuer`)).json();
    expect(meta.credential_issuer).toBe(base);
    expect(meta.credential_endpoint).toBe(`${base}/credential`);
    expect(Object.keys(meta.credential_configurations_supported)).toEqual(['NationalId_W3C_JSONLD', 'NationalId_SD_JWT']);
  });

  it('issues a really signed W3C credential and an SD-JWT', async () => {
    const post = (body: unknown) => fetch(`${base}/credential`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json() as Promise<any>);
    const w3c = await post({ format: 'ldp_vc' });
    expect(await ldpProofProblem(w3c.credential, 'assertion')).toBeNull();
    expect(w3c.credentials[0].credential).toEqual(w3c.credential);
    const sd = await post({ format: 'vc+sd-jwt' });
    expect(sd.credential.rawToken).toContain('~');
  });

  it('issues tokens and nonces', async () => {
    expect(((await (await fetch(`${base}/token`, { method: 'POST' })).json()) as any).token_type).toBe('bearer');
    expect(((await (await fetch(`${base}/nonce`, { method: 'POST' })).json()) as any).c_nonce).toMatch(/^nonce-/);
  });
});

describe('rateLimit', () => {
  it('answers 429 with Retry-After once a client exceeds the window', async () => {
    const app = express();
    app.use(rateLimit({ windowMs: 60_000, max: 2 }));
    app.get('/', (_req, res) => res.json({ ok: true }));
    const s = app.listen(0);
    await new Promise(r => s.once('listening', r));
    const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}/`;
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await fetch(url)).status);
    const limited = await fetch(url);
    s.close();
    expect(statuses).toEqual([200, 200, 429]);
    expect(limited.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(limited.headers.get('ratelimit-remaining')).toBe('0');
  });
});
