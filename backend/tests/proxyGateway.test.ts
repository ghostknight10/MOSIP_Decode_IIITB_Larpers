import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let upstream: http.Server;
let gateway: http.Server;
let base: string;
const received: { method?: string; url?: string; body: string; headers: http.IncomingHttpHeaders }[] = [];

const listen = async (server: http.Server) => {
  server.listen(0);
  await new Promise(r => server.once('listening', r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      received.push({ method: req.method, url: req.url, body, headers: req.headers });
      if (req.url?.startsWith('/missing')) {
        res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'not_found' }));
      } else if (req.url?.startsWith('/text')) {
        res.writeHead(200, { 'content-type': 'text/plain' }).end('hello');
      } else {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ echoed: req.url, access_token: 'upstream-secret' }));
      }
    });
  });
  
  process.env.MOCK_URL = await listen(upstream);
  const { default: proxyRouter } = await import('../src/routes/proxyGateway.js');
  const app = express();
  app.use(express.json());
  app.use(proxyRouter);
  gateway = app.listen(0);
  await new Promise(r => gateway.once('listening', r));
  base = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`;
});

afterAll(() => {
  gateway.close();
  upstream.close();
  delete process.env.MOCK_URL;
});

const call = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`${base}${path}`, init);
  return { status: res.status, body: (await res.json()) as any };
};

describe('proxy gateway', () => {
  it('forwards GET requests with path and query string intact', async () => {
    const { status, body } = await call('/api/proxy/MOCK_ISSUER/.well-known/openid-credential-issuer?lang=en');
    expect(status).toBe(200);
    expect(body.echoed).toBe('/.well-known/openid-credential-issuer?lang=en');
  });

  it('forwards POST bodies and caller headers', async () => {
    await call('/api/proxy/MOCK_ISSUER/credential', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer caller' },
      body: JSON.stringify({ format: 'ldp_vc' })
    });
    const last = received.at(-1)!;
    expect(last.method).toBe('POST');
    expect(JSON.parse(last.body)).toEqual({ format: 'ldp_vc' });
    expect(last.headers.authorization).toBe('Bearer caller');
    expect(last.headers['x-audit-destination']).toBe('MOCK_ISSUER');
  });

  it('forwards JSON that is not byte-identical after re-serialising (no hang)', async () => {
    const res = await fetch(`${base}/api/proxy/MOCK_ISSUER/credential`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ "format" :   "ldp_vc" }',
      signal: AbortSignal.timeout(3000)
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(received.at(-1)!.body)).toEqual({ format: 'ldp_vc' });
  });

  it('does not forward cookies or other browser headers upstream', async () => {
    await call('/api/proxy/MOCK_ISSUER/x', { headers: { cookie: 'session=secret', referer: 'http://localhost:5173/', 'x-transaction-id': 'tx-h' } });
    const { headers } = received.at(-1)!;
    expect(headers.cookie).toBeUndefined();
    expect(headers.referer).toBeUndefined();
    expect(headers['x-transaction-id']).toBe('tx-h');
  });

  it('sends no body on GET', async () => {
    await call('/api/proxy/MOCK_ISSUER/x');
    expect(received.at(-1)!.body).toBe('');
  });

  it('keeps the upstream path when the prefix is percent-encoded', async () => {
    const { body } = await call('/api/proxy/MOCK%5FISSUER/a/b?x=1');
    expect(body.echoed).toBe('/a/b?x=1');
  });

  it('marks Inji targets as sandbox regardless of case', async () => {
    process.env.MOSIP_INJI_VERIFY_URL = process.env.MOCK_URL;
    const { body } = await call('/api/proxy/inji_verify/x', { headers: { 'x-transaction-id': 'tx-sbx' } });
    delete process.env.MOSIP_INJI_VERIFY_URL;
    expect(body._auditTrail[0]).toMatchObject({ isSandbox: true, destination: 'INJI_VERIFY' });
  });

  it('does not leak internal error text when the upstream is unreachable', async () => {
    process.env.MOSIP_INJI_CERTIFY_URL = 'http://127.0.0.1:1';
    const { status, body } = await call('/api/proxy/INJI_CERTIFY/x');
    delete process.env.MOSIP_INJI_CERTIFY_URL;
    expect(status).toBe(500);
    expect(body).toMatchObject({ error: 'Upstream request failed', code: 'ECONNREFUSED' });
    // The audit trail records the destination on purpose; the error fields must not.
    const { _auditTrail, ...error } = body;
    expect(JSON.stringify(error)).not.toContain('127.0.0.1');
  });

  it('resolves target names case-insensitively', async () => {
    const { status } = await call('/api/proxy/mock_issuer/anything');
    expect(status).toBe(200);
  });

  it('rejects unknown targets', async () => {
    expect(await call('/api/proxy/NOPE/x')).toEqual({ status: 400, body: { error: 'Unknown routing target: NOPE' } });
  });

  it('attaches the redacted audit trail for the transaction', async () => {
    const { body } = await call('/api/proxy/MOCK_ISSUER/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer caller', 'x-transaction-id': 'tx-proxy-1' },
      body: JSON.stringify({ client_secret: 's' })
    });
    expect(body._auditTrail).toHaveLength(1);
    const [frame] = body._auditTrail;
    expect(frame).toMatchObject({ transactionId: 'tx-proxy-1', origin: 'BFF_Proxy_Gateway', isSandbox: false, destination: 'MOCK_ISSUER' });
    expect(frame.packet.request.headers.authorization).toBe('[REDACTED]');
    expect(frame.packet.request.body).toEqual({ client_secret: '[REDACTED]' });
    expect(frame.packet.response.body.access_token).toBe('[REDACTED]');
    expect(body.access_token).toBe('upstream-secret');
  });

  it('propagates upstream error statuses with the audit trail', async () => {
    const { status, body } = await call('/api/proxy/MOCK_VERIFIER/missing', { headers: { 'x-transaction-id': 'tx-proxy-2' } });
    expect(status).toBe(404);
    expect(body.error).toBe('not_found');
    expect(body._auditTrail[0].packet.response.statusCode).toBe(404);
  });

  it('passes non-JSON upstream bodies through intact', async () => {
    const { body } = await call('/api/proxy/MOCK_ISSUER/text');
    expect(body).not.toHaveProperty('0');
  });
});