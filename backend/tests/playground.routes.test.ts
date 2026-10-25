import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import axios from 'axios';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { playgroundRouter } from '../src/routes/playground.js';
import globalAuditBuffer from '../src/utils/RingBuffer.js';
import { MockProtocolService } from '../src/mocks/mockService.js';

vi.mock('axios', async importOriginal => {
  const actual = await importOriginal<typeof import('axios')>();
  return { ...actual, default: { ...actual.default, post: vi.fn() } };
});
const postMock = vi.mocked(axios.post);

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/playground', playgroundRouter);
  server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/playground`;
});
afterAll(() => server.close());

beforeEach(() => {
  (globalAuditBuffer as any).clearLogs();
  postMock.mockReset().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const post = async (path: string, body: unknown, txId?: string) => {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(txId ? { 'x-transaction-id': txId } : {}) },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: (await res.json()) as any };
};

const issueBody = { issuer: 'mock-openid4vci', wallet: 'mock-wallet', format: 'w3c-vc', credentialSubject: { fullName: 'Priya Rao' } };

describe('POST /issue', () => {
  it('issues through the mock OpenID4VCI issuer', async () => {
    const { status, body } = await post('/issue', issueBody, 'tx-i1');
    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, issuer: 'mock-openid4vci', wallet: 'mock-wallet', format: 'w3c-vc' });
    expect(body.credentialOffer.credential_issuer).toBe('https://issuer.mock.mosip.net');
    expect(body.issuedCredential.credentialSubject.fullName).toBe('Priya Rao');
    expect(body.isSandboxFallback).toBeUndefined();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('tags protocol logs with the caller transaction id', async () => {
    const { body } = await post('/issue', issueBody, 'tx-i2');
    expect(body.protocolLogs).toHaveLength(2);
    expect(body.protocolLogs.every((l: any) => l.transactionId === 'tx-i2')).toBe(true);
  });

  it('generates a transaction id when none is sent', async () => {
    const { body } = await post('/issue', issueBody);
    expect(body.protocolLogs[0].transactionId).toMatch(/^tx-[0-9a-f]{8}$/);
  });

  it.each([
    ['w3c-vc', 'ldp_vc'],
    ['sd-jwt', 'vc+sd-jwt']
  ])('calls Inji Certify with the %s wire format', async (format, wire) => {
    postMock.mockResolvedValue({ data: { credential: 'from-certify' } });
    const { body } = await post('/issue', { ...issueBody, issuer: 'inji-certify', format });
    expect(postMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/v1\/certify\/credentials\/issue$/),
      { format: wire, claims: { fullName: 'Priya Rao' } },
      { timeout: 5000 }
    );
    expect(body).toMatchObject({ success: true, issuedCredential: { credential: 'from-certify' } });
  });

  it('falls back to an emulated Inji Certify when the sandbox is unreachable', async () => {
    const { body } = await post('/issue', { ...issueBody, issuer: 'inji-certify' }, 'tx-i3');
    expect(body).toMatchObject({ success: true, isSandboxFallback: true, notice: expect.stringContaining('emulated') });
    expect(body.credentialOffer).toBeDefined();
    // FIX: Using .some() instead of .every() to respect the preserved wallet hops
    expect(body.protocolLogs.some((l: any) => l.receiver === 'Inji Certify (Collab Sandbox Emulated)')).toBe(true);
  });

  it('returns a credential offer for real Inji Certify issuance', async () => {
    postMock.mockResolvedValue({ data: { credential: 'from-certify' } });
    const { body } = await post('/issue', { ...issueBody, issuer: 'inji-certify' });
    expect(body.credentialOffer).toBeDefined();
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await fetch(`${base}/issue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    expect(res.status).toBe(400);
  });

  it('answers a request without a JSON body with a JSON 400', async () => {
    const res = await fetch(`${base}/issue`, { method: 'POST' });
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

describe('POST /verify', () => {
  // Generate an actual valid credential for the test instead of a dummy payload
  const validCredential = MockProtocolService.issueCredential('w3c-vc').issuedCredential;
  const verifyBody = { verifier: 'mock-openid4vp', wallet: 'mock-wallet', format: 'w3c-vc', credentialOrToken: validCredential };

  it('verifies through the mock OpenID4VP verifier', async () => {
    const { body } = await post('/verify', verifyBody, 'tx-v1');
    expect(body).toMatchObject({ success: true, isValid: true, verificationResult: { status: 'VALID' } });
    expect(body.presentationDefinition.input_descriptors).toHaveLength(1);
    expect(body.protocolLogs.map((l: any) => l.step)).toEqual([3, 4]);
  });

  it('returns the whole transaction, including issuance frames', async () => {
    await post('/issue', issueBody, 'tx-v2');
    const { body } = await post('/verify', verifyBody, 'tx-v2');
    expect(body.protocolLogs.map((l: any) => l.step)).toEqual([1, 2, 3, 4]);
  });

  it.each([
    [{ forceExpired: true }, 'EXPIRED'],
    [{ corruptSignature: true }, 'SIGNATURE_MISMATCH']
  ])('applies tamper payload %o', async (tamperPayload, status) => {
    const { body } = await post('/verify', { ...verifyBody, tamperPayload });
    expect(body).toMatchObject({ isValid: false, verificationResult: { status } });
  });

  it('forwards the vp_token to Inji Verify when reachable', async () => {
    postMock.mockResolvedValue({ data: { status: 'VALID' } });
    const { body } = await post('/verify', { ...verifyBody, verifier: 'inji-verify' });
    expect(postMock).toHaveBeenCalledWith(expect.stringMatching(/\/v1\/verify\/presentation$/), { vp_token: validCredential }, { timeout: 5000 });
    expect(body).toMatchObject({ success: true, verificationResult: { status: 'VALID' } });
  });

  it('falls back to an emulated Inji Verify when the sandbox is unreachable', async () => {
    const { body } = await post('/verify', { ...verifyBody, verifier: 'inji-verify' });
    expect(body).toMatchObject({ isSandboxFallback: true, isValid: true });
    expect(body.protocolLogs.some((l: any) => l.sender === 'Inji Verify (Collab Sandbox Emulated)')).toBe(true);
  });

  it('normalises real Inji Verify responses to the playground shape', async () => {
    postMock.mockResolvedValue({ data: { verificationStatus: 'SUCCESS' } });
    const { body } = await post('/verify', { ...verifyBody, verifier: 'inji-verify' });
    expect(body.isValid).toBe(true);
    expect(body.verificationResult.checks).toBeDefined();
  });
});

describe('logs and matrix endpoints', () => {
  it('returns recent frames newest-first and clears them', async () => {
    await post('/issue', issueBody, 'tx-l1');
    let res = await fetch(`${base}/logs`);
    const logs = (await res.json()) as any;
    expect(logs.count).toBe(2);
    expect(logs.logs.map((l: any) => l.step)).toEqual([2, 1]);

    res = await fetch(`${base}/logs`, { method: 'DELETE' });
    expect(await res.json()).toMatchObject({ success: true });
    expect(((await (await fetch(`${base}/logs`)).json()) as any).count).toBe(0);
  });

  it('serves the pre-wired matrix status', async () => {
    const body = (await (await fetch(`${base}/matrix-status`)).json()) as any;
    expect(body.matrix).toHaveLength(8);
    expect(body.matrix[0]).toEqual({ issuer: 'inji-certify', wallet: 'inji-wallet', verifier: 'inji-verify', format: 'w3c-vc', status: 'PASS' });
  });
});