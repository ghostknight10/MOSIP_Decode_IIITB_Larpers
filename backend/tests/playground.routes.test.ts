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
  return { ...actual, default: { ...actual.default, post: vi.fn(), request: vi.fn() } };
});
const postMock = vi.mocked(axios.post);
const requestMock = vi.mocked(axios.request);

const json = (status: number, data: unknown) => ({ status, data, headers: { 'content-type': 'application/json' } });
const CERTIFY = 'https://injicertify-mosipid.collab.mosip.net';
const METADATA = {
  credential_issuer: CERTIFY,
  credential_endpoint: `${CERTIFY}/v1/certify/issuance/credential`,
  authorization_servers: ['https://esignet-mosipid.collab.mosip.net'],
  credential_configurations_supported: {
    MOSIPVerifiableCredential: { format: 'ldp_vc', credential_definition: { type: ['VerifiableCredential', 'MOSIPVerifiableCredential'] } }
  }
};
const unreachable = () => Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });

/** Answers live Collab calls by URL fragment; overrides win. */
const collab = (overrides: Record<string, unknown> = {}) =>
  requestMock.mockImplementation((async ({ url }: { url: string }) => {
    const answers: Record<string, unknown> = {
      'openid-credential-issuer': json(200, METADATA),
      '/issuance/credential': json(403, { status: 403, error: 'Forbidden' }),
      '/mimoto/issuers': json(200, { response: { issuers: [{ issuer_id: 'Mosip', credential_issuer_host: CERTIFY }] } }),
      '/vc-verification': json(200, { verificationStatus: 'SUCCESS' }),
      ...overrides
    };
    const match = Object.keys(answers).find(part => url.includes(part));
    const answer = match ? answers[match] : unreachable();
    if (answer instanceof Error) throw answer;
    return answer;
  }) as any);
const requestedUrls = () => requestMock.mock.calls.map(([config]: any[]) => config.url);

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
  postMock.mockReset().mockRejectedValue(unreachable());
  requestMock.mockReset().mockRejectedValue(unreachable());
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
    expect(body.proofType).toBe('Ed25519Signature2020');
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

  describe('with Inji Certify', () => {
    const certifyBody = { ...issueBody, issuer: 'inji-certify' };

    it('fetches live metadata and tries the credential endpoint, then emulates the credential', async () => {
      collab();
      const { body } = await post('/issue', certifyBody, 'tx-c1');
      expect(requestedUrls()).toEqual([`${CERTIFY}/v1/certify/.well-known/openid-credential-issuer`, METADATA.credential_endpoint]);
      expect(body.protocolLogs.map((l: any) => [l.step, l.action, l.status, Boolean(l.live)])).toEqual([
        [1, 'Fetch issuer metadata', 'SUCCESS', true],
        [2, 'Credential request (no access token)', 'FAILED', true],
        [3, 'Credential Request (/credential)', 'SUCCESS', false]
      ]);
      expect(body.protocolLogs[2].receiver).toBe('Inji Certify (Collab Sandbox Emulated)');
      expect(body).toMatchObject({ success: true, isSandboxFallback: true });
      expect(body.notice).toBe('Inji Certify answered live, but its credential endpoint needs an eSignet access token (HTTP 403). The credential itself is emulated.');
      expect(body.credentialOffer).toEqual({
        credential_issuer: CERTIFY,
        credential_configuration_ids: ['MOSIPVerifiableCredential'],
        grants: { authorization_code: { authorization_server: 'https://esignet-mosipid.collab.mosip.net' } }
      });
      expect(body.issuedCredential.credentialSubject.fullName).toBe('Priya Rao');
    });

    it("asks for the configuration's format and type at the credential endpoint", async () => {
      collab();
      await post('/issue', certifyBody);
      expect(requestMock.mock.calls[1][0]).toMatchObject({
        method: 'POST',
        data: { format: 'ldp_vc', credential_definition: { type: ['VerifiableCredential', 'MOSIPVerifiableCredential'] } }
      });
    });

    it('looks the issuer up in Mimoto when the Inji wallet holds the credential', async () => {
      collab();
      const { body } = await post('/issue', { ...certifyBody, wallet: 'inji-wallet' });
      expect(requestedUrls()).toContain('https://api.collab.mosip.net/v1/mimoto/issuers');
      expect(body.protocolLogs[1]).toMatchObject({ sender: 'Inji Wallet', receiver: 'Mimoto (Inji wallet backend)', live: true });
    });

    it('says so when Certify does not offer the requested format', async () => {
      collab();
      const { body } = await post('/issue', { ...certifyBody, format: 'sd-jwt' });
      expect(requestedUrls()).not.toContain(METADATA.credential_endpoint);
      expect(body.notice).toContain('answered live, but it offers no vc+sd-jwt credential (only MOSIPVerifiableCredential)');
      expect(body.credentialOffer.credential_configuration_ids).toEqual([]);
    });

    it('never calls a credential endpoint on another origin', async () => {
      collab({ 'openid-credential-issuer': json(200, { ...METADATA, credential_endpoint: 'http://169.254.169.254/latest' }) });
      const { body } = await post('/issue', certifyBody);
      expect(requestedUrls()).toHaveLength(1);
      expect(body.notice).toContain('another origin');
    });

    it.each([
      ['unreachable', unreachable()],
      ['answering HTML', { status: 200, data: '<html>', headers: { 'content-type': 'text/html' } }]
    ])('emulates Inji Certify entirely when it is %s', async (_label, answer) => {
      collab({ 'openid-credential-issuer': answer });
      const { body } = await post('/issue', certifyBody, 'tx-c2');
      expect(body).toMatchObject({ success: true, isSandboxFallback: true, notice: expect.stringContaining('emulated by the mock engine') });
      expect(body.protocolLogs.map((l: any) => l.receiver)).toEqual(['Inji Certify (Collab Sandbox Emulated)', 'Inji Certify (Collab Sandbox Emulated)']);
      expect(body.protocolLogs.every((l: any) => l.sender === 'Wallet')).toBe(true);
    });

    it('keeps the failed live metadata call before the emulated steps', async () => {
      collab({ 'openid-credential-issuer': json(404, { error: 'not found' }) });
      const { body } = await post('/issue', certifyBody);
      expect(body.notice).toContain('Inji Certify metadata unavailable (HTTP 404)');
      expect(body.protocolLogs.map((l: any) => [l.step, l.status, Boolean(l.live)])).toEqual([[1, 'FAILED', true], [2, 'SUCCESS', false], [3, 'SUCCESS', false]]);
    });

    it('streams each live step as soon as it completes', async () => {
      const seen: string[] = [];
      const onFrame = (frame: any) => seen.push(frame.action);
      globalAuditBuffer.on('newFrame', onFrame);
      let answerCredential: (value: unknown) => void = () => {};
      // The credential request stays open until the metadata frame has been seen.
      collab({ '/issuance/credential': new Promise(resolve => (answerCredential = resolve)) });
      const pending = post('/issue', certifyBody);
      await vi.waitFor(() => expect(seen).toEqual(['Fetch issuer metadata']));
      answerCredential(json(403, { error: 'Forbidden' }));
      await pending;
      expect(seen.slice(0, 2)).toEqual(['Fetch issuer metadata', 'Credential request (no access token)']);
      globalAuditBuffer.off('newFrame', onFrame);
    });
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

describe('request validation', () => {
  it.each([
    ['an array body', ['x'], 'JSON body is required'],
    ['an unknown issuer', { ...issueBody, issuer: 'evil' }, 'issuer must be one of'],
    ['an unknown wallet', { ...issueBody, wallet: 'evil' }, 'wallet must be one of'],
    ['an unknown format', { ...issueBody, format: 'mso_mdoc' }, 'format must be one of'],
    ['a non-string subject field', { ...issueBody, credentialSubject: { fullName: { $gt: '' } } }, 'credentialSubject'],
    ['non-boolean tamper flags', { ...issueBody, tamperPayload: { forceExpired: 'yes' } }, 'tamperPayload']
  ])('rejects %s on /issue with 400', async (_label, body, message) => {
    const res = await post('/issue', body);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(message);
    expect(postMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown verifier on /verify', async () => {
    const res = await post('/verify', { verifier: 'evil', wallet: 'mock-wallet', format: 'w3c-vc' });
    expect(res.status).toBe(400);
  });

  it('replaces a malformed transaction id', async () => {
    const { body } = await post('/issue', issueBody, 'tx bad; drop');
    expect(body.protocolLogs[0].transactionId).toMatch(/^tx-[0-9a-f]{8}$/);
  });

  it('answers internal errors without the exception text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(MockProtocolService, 'issueCredential').mockImplementation(() => {
      throw new Error('secret internal detail');
    });
    const res = await post('/issue', issueBody);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Issuance flow encountered an internal error');
  });
});

describe('GET /logs/stream', () => {
  it('pushes new frames to connected clients and detaches on close', async () => {
    const controller = new AbortController();
    const res = await fetch(`${base}/logs/stream`, { signal: controller.signal });
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const reader = res.body!.getReader();
    const read = async () => new TextDecoder().decode((await reader.read()).value);
    expect(await read()).toContain('SSE audit log stream connected');

    await post('/issue', issueBody, 'tx-sse');
    let text = '';
    while (!text.includes('tx-sse')) text += await read();
    expect(text).toContain('"transactionId":"tx-sse"');

    controller.abort();
    await new Promise(r => setTimeout(r, 50));
    expect(globalAuditBuffer.listenerCount('newFrame')).toBe(0);
  });
});

describe('POST /verify', () => {
  // Generate an actual valid credential for the test instead of a dummy payload
  let validCredential: any;
  let verifyBody: any;
  beforeAll(async () => {
    validCredential = (await MockProtocolService.issueCredential('w3c-vc')).issuedCredential;
    verifyBody = { verifier: 'mock-openid4vp', wallet: 'mock-wallet', format: 'w3c-vc', credentialOrToken: validCredential };
  });

  it('verifies through the mock OpenID4VP verifier', async () => {
    const { body } = await post('/verify', verifyBody, 'tx-v1');
    expect(body).toMatchObject({ success: true, isValid: true, verificationResult: { status: 'VALID' } });
    expect(body.presentationDefinition.input_descriptors).toHaveLength(1);
    expect(body.client_id).toBe('https://verify.mock.mosip.net');
    expect(body.nonce).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.protocolLogs.map((l: any) => l.step)).toEqual([1, 2]);
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

  describe('with Inji Verify', () => {
    const injiBody = () => ({ ...verifyBody, verifier: 'inji-verify' });

    it('submits the credential to /vc-verification and reports the live verdict', async () => {
      collab();
      const { body } = await post('/verify', injiBody(), 'tx-iv1');
      expect(requestMock).toHaveBeenCalledTimes(1);
      expect(requestMock.mock.calls[0][0]).toMatchObject({
        method: 'POST',
        url: 'https://injiverify.collab.mosip.net/v1/verify/vc-verification',
        headers: { 'Content-Type': 'application/vc+ld+json' },
        data: validCredential
      });
      expect(body).toMatchObject({ success: true, isValid: true, client_id: 'https://injiverify.collab.mosip.net', verificationResult: { status: 'VALID' } });
      expect(body.isSandboxFallback).toBeUndefined();
      expect(body.verificationResult.verifiedClaims).toEqual({
        fullName: validCredential.credentialSubject.fullName,
        nationalId: validCredential.credentialSubject.nationalId
      });
      expect(body.presentationDefinition.input_descriptors).toHaveLength(1);
      expect(body.protocolLogs).toEqual([
        expect.objectContaining({ step: 1, live: true, sender: 'Wallet', receiver: 'Inji Verify (Collab Sandbox)', status: 'SUCCESS' })
      ]);
    });

    it.each([
      ['INVALID', 'INVALID', { signatureValid: false, notExpired: true }],
      ['EXPIRED', 'EXPIRED', { signatureValid: true, notExpired: false }],
      ['SOMETHING_NEW', 'INVALID', { signatureValid: false }]
    ])('maps verificationStatus %s to %s', async (reported, status, checks) => {
      collab({ '/vc-verification': json(200, { verificationStatus: reported }) });
      const { body } = await post('/verify', injiBody());
      expect(body).toMatchObject({ isValid: false, verificationResult: { status, checks, verifiedClaims: {} } });
      expect(body.verificationResult.details).toContain(reported);
      expect(body.protocolLogs[0]).toMatchObject({ status: 'FAILED', response: { status: 200 } });
    });

    it('sends a really tampered credential and marks the step', async () => {
      collab({ '/vc-verification': json(200, { verificationStatus: 'INVALID' }) });
      const { body } = await post('/verify', { ...injiBody(), tamperPayload: { forceExpired: true, corruptSignature: true } });
      const sent = requestMock.mock.calls[0][0].data as any;
      expect(new Date(sent.expirationDate).getTime()).toBeLessThan(Date.now());
      expect(sent.proof.proofValue).not.toBe(validCredential.proof.proofValue);
      expect(body.protocolLogs[0].tampered).toBe(true);
    });

    it('sends an SD-JWT as a compact token', async () => {
      collab();
      const sdJwt = (await MockProtocolService.issueCredential('sd-jwt')).issuedCredential;
      await post('/verify', { ...injiBody(), format: 'sd-jwt', credentialOrToken: sdJwt });
      expect(requestMock.mock.calls[0][0]).toMatchObject({ headers: { 'Content-Type': 'application/vc+sd-jwt' }, data: sdJwt.rawToken });
    });

    it.each([
      ['unreachable', unreachable()],
      ['answering HTML', { status: 200, data: '<html>', headers: { 'content-type': 'text/html' } }],
      ['failing without a status', json(502, { error: 'bad gateway' })]
    ])('falls back to an emulated Inji Verify when it is %s', async (_label, answer) => {
      collab({ '/vc-verification': answer });
      const { body } = await post('/verify', injiBody());
      expect(body).toMatchObject({ isSandboxFallback: true, isValid: true, notice: expect.stringContaining('emulated by the mock engine') });
      expect(body.protocolLogs.find((l: any) => l.step === 2)).toMatchObject({ sender: 'Wallet', receiver: 'Inji Verify (Collab Sandbox Emulated)' });
      expect(body.protocolLogs.some((l: any) => l.sender === 'Inji Verify (Collab Sandbox Emulated)')).toBe(true);
    });
  });
});

describe('GET /ref/:id (passing by reference)', () => {
  it('serves the credential offer and presentation definition a response points to', async () => {
    const issued = (await post('/issue', issueBody)).body;
    expect(issued.credentialOfferUri).toMatch(/^\/api\/playground\/ref\/[0-9a-f-]{36}$/);
    const offer = await (await fetch(`${base}${issued.credentialOfferUri.replace('/api/playground', '')}`)).json();
    expect(offer).toEqual(issued.credentialOffer);

    const verified = (await post('/verify', { verifier: 'mock-openid4vp', wallet: 'mock-wallet', format: 'w3c-vc', credentialOrToken: issued.issuedCredential })).body;
    const pd = await (await fetch(`${base}${verified.presentationDefinitionUri.replace('/api/playground', '')}`)).json();
    expect(pd).toEqual(verified.presentationDefinition);
  });

  it('answers 404 for unknown references', async () => {
    const res = await fetch(`${base}/ref/00000000-0000-0000-0000-000000000000`);
    expect(res.status).toBe(404);
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