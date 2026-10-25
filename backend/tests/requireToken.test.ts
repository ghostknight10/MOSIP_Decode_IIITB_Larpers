import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { requireToken } from '../src/middleware/requireToken.js';

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(requireToken);
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/playground/logs', (_req, res) => res.json({ logs: [] }));
  server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
afterEach(() => delete process.env.PLAYGROUND_TOKEN);

const get = (path: string, token?: string) =>
  fetch(`${base}${path}`, { headers: token === undefined ? {} : { 'x-playground-token': token } });

describe('requireToken', () => {
  it('leaves the BFF open when PLAYGROUND_TOKEN is unset', async () => {
    expect((await get('/api/playground/logs')).status).toBe(200);
  });

  it.each([
    ['missing', undefined],
    ['wrong', 'nope'],
    ['a prefix of the right one', 's3cre']
  ])('rejects a %s token with 401', async (_label, token) => {
    process.env.PLAYGROUND_TOKEN = 's3cret';
    const res = await get('/api/playground/logs', token);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: 'Missing or wrong x-playground-token' });
  });

  it('accepts the right token', async () => {
    process.env.PLAYGROUND_TOKEN = 's3cret';
    expect((await get('/api/playground/logs', 's3cret')).status).toBe(200);
  });

  it('keeps /api/health open for health checks', async () => {
    process.env.PLAYGROUND_TOKEN = 's3cret';
    expect((await get('/api/health')).status).toBe(200);
  });

  it('keeps non-api static routes open even when PLAYGROUND_TOKEN is set', async () => {
    process.env.PLAYGROUND_TOKEN = 's3cret';
    expect((await get('/')).status).toBe(404); // hits next() without 401
  });
});
