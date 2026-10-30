import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import axios from 'axios';
import express from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { playgroundRouter } from '../src/routes/playground.js';
import globalAuditBuffer from '../src/utils/RingBuffer.js';
import { MockProtocolService } from '../src/mocks/mockService.js';
import { resetMetrics } from '../src/utils/metrics.js';

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
      '/vc-verification': json(200, { allChecksSuccessful: true, schemaAndSignatureCheck: { valid: true, error: null }, expiryCheck: { valid: true }, statusCheck: [], claims: {} }),
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

describe('POST /issue with a Collab test identity (real Inji issuance)', () => {
  const LAND = 'https://injicertify-landregistry.collab.mosip.net';
  const REAL_VC = { '@context': ['https://www.w3.org/2018/credentials/v1'], type: ['VerifiableCredential', 'LandStatementCredential'], issuer: 'did:web:injicertify-landregistry.collab.mosip.net', credentialSubject: { RuralPropertyName: 'Saint Helena Farm' }, proof: { type: 'Ed25519Signature2020', proofValue: 'z123' } };
  const login = (overrides: Record<string, unknown> = {}) =>
    collab({
      '/csrf/token': { status: 200, data: { token: 'x' }, headers: { 'content-type': 'application/json', 'set-cookie': ['XSRF-TOKEN=csrf-1; Path=/'] } },
      '/oauth-details': json(200, { response: { transactionId: 'tx-esignet' }, errors: [] }),
      '/send-otp': json(200, { response: { transactionId: 'tx-esignet' }, errors: [] }),
      '/authenticate': json(200, { response: { transactionId: 'tx-esignet' }, errors: [] }),
      '/auth-code': json(200, { response: { code: 'auth-code-1' }, errors: [] }),
      '/get-token/Land': json(200, { access_token: 'secret-token', token_type: 'Bearer' }),
      '/certify/nonce': json(200, { c_nonce: 'certify-nonce' }),
      '/issuance/credential': json(200, { credentials: [{ credential: REAL_VC }] }),
      ...overrides
    });
  const body = { ...issueBody, issuer: 'inji-certify', wallet: 'inji-wallet' };

  beforeEach(() => {
    process.env.COLLAB_TEST_INDIVIDUAL_ID = '8267411578';
  });
  afterEach(() => {
    delete process.env.COLLAB_TEST_INDIVIDUAL_ID;
  });

  it('logs in to eSignet, gets a token through Mimoto and returns the real credential', async () => {
    login();
    const { body: res } = await post('/issue', body, 'tx-real');
    expect(res).toMatchObject({ success: true, issuedCredential: REAL_VC, proofType: 'Ed25519Signature2020' });
    expect(res.isSandboxFallback).toBeUndefined();
    expect(res.notice).toContain('Real credential');
    expect(res.credentialOffer).toMatchObject({ credential_issuer: LAND, credential_configuration_ids: ['LandStatementCredential'] });
    expect(res.protocolLogs.map((l: any) => l.action)).toEqual([
      'Authorization request (eSignet oauth-details)',
      'Send OTP to the test identity',
      'Authenticate with OTP',
      'Authorization code',
      'Token request (via Mimoto)',
      'Nonce request',
      'Credential request (/credential)'
    ]);
    expect(res.protocolLogs.every((l: any) => l.live)).toBe(true);
  });

  it('binds eSignet calls to the XSRF cookie and the authorization details', async () => {
    login();
    await post('/issue', body);
    const otp = requestMock.mock.calls.find(([c]: any[]) => c.url.endsWith('/send-otp'))![0] as any;
    expect(otp.headers).toMatchObject({ Cookie: 'XSRF-TOKEN=csrf-1', 'X-XSRF-TOKEN': 'csrf-1', 'oauth-details-key': 'tx-esignet' });
    expect(otp.headers['oauth-details-hash']).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const credential = requestMock.mock.calls.find(([c]: any[]) => c.url.endsWith('/issuance/credential'))![0] as any;
    expect(credential.headers.Authorization).toBe('Bearer secret-token');
    expect(credential.data).toMatchObject({ credential_configuration_id: 'LandStatementCredential', proofs: { jwt: [expect.any(String)] } });
  });

  it('keeps the OTP, CSRF token, code and access token out of the logs', async () => {
    login();
    const { body: res } = await post('/issue', body);
    const logs = JSON.stringify(res.protocolLogs);
    for (const secret of ['111111', 'csrf-1', 'auth-code-1', 'secret-token']) expect(logs).not.toContain(secret);
  });

  it('falls back to discovery and emulation, saying which step refused', async () => {
    login({ '/issuance/credential': json(400, { error: 'ERROR_FETCHING_IDENTITY_DATA' }) });
    const { body: res } = await post('/issue', body);
    expect(res).toMatchObject({ success: true, isSandboxFallback: true });
    expect(res.notice).toMatch(/^Certify credential request refused: ERROR_FETCHING_IDENTITY_DATA\. /);
    expect(res.issuedCredential.issuer).toMatch(/^did:key:/);
  });

  it('only runs for W3C credentials', async () => {
    login();
    await post('/issue', { ...body, format: 'sd-jwt' });
    expect(requestMock.mock.calls.some(([c]: any[]) => c.url.includes('esignet'))).toBe(false);
  });
});

describe('GET /metrics', () => {
  it('counts flows and Collab calls, as JSON and as Prometheus text', async () => {
    resetMetrics();
    collab();
    await post('/issue', { ...issueBody, issuer: 'inji-certify' });
    await post('/issue', { issuer: 'evil' });
    const metrics: any = await (await fetch(`${base}/metrics`)).json();
    expect(metrics.flows).toEqual([
      expect.objectContaining({ flow: 'issue', issuer: 'inji-certify', format: 'w3c-vc', count: 1, failures: 0, emulated: 1 }),
      expect.objectContaining({ flow: 'issue', issuer: 'evil', format: 'unknown', count: 1, failures: 1 })
    ]);
    expect(metrics.services.map((s: any) => s.host)).toContain('injicertify-mosipid.collab.mosip.net');
    const text = await (await fetch(`${base}/metrics?format=prometheus`)).text();
    expect(text).toContain('playground_flow_requests_total{flow="issue",issuer="inji-certify",format="w3c-vc"} 1');
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
    const v2 = (overrides: Record<string, unknown> = {}) =>
      json(200, {
        allChecksSuccessful: true,
        schemaAndSignatureCheck: { valid: true, error: null },
        expiryCheck: { valid: true },
        statusCheck: [],
        claims: { fullName: 'From Inji', nationalId: 'INJI-1', email: 'x@y.z' },
        ...overrides
      });

    it('submits the credential to /v2/vc-verification and reports the live verdict', async () => {
      collab({ '/vc-verification': v2() });
      const { body } = await post('/verify', injiBody(), 'tx-iv1');
      expect(requestMock).toHaveBeenCalledTimes(1);
      const config = requestMock.mock.calls[0][0] as any;
      expect(config).toMatchObject({ method: 'POST', url: 'https://injiverify.collab.mosip.net/v1/verify/v2/vc-verification', headers: { 'Content-Type': 'application/json' } });
      expect(config.data).toMatchObject({ skipStatusChecks: false, includeClaims: true });
      expect(JSON.parse(config.data.verifiableCredential)).toEqual(validCredential);
      expect(body).toMatchObject({ success: true, isValid: true, client_id: 'https://injiverify.collab.mosip.net', verificationResult: { status: 'VALID' } });
      expect(body.isSandboxFallback).toBeUndefined();
      // Only the requested claims, as Inji Verify extracted them.
      expect(body.verificationResult.verifiedClaims).toEqual({ fullName: 'From Inji', nationalId: 'INJI-1' });
      expect(body.verificationResult.checks).toEqual({ formatCheck: true, signatureValid: true, notExpired: true, schemaCompliant: true });
      expect(body.protocolLogs).toEqual([
        expect.objectContaining({ step: 1, live: true, sender: 'Wallet', receiver: 'Inji Verify (Collab Sandbox)', status: 'SUCCESS' })
      ]);
    });

    it.each([
      ['a signature failure', { allChecksSuccessful: false, schemaAndSignatureCheck: { valid: false, error: { errorCode: 'ERR_SIGNATURE_VERIFICATION_FAILED', errorMessage: 'Verification Failed' } }, expiryCheck: null }, 'SIGNATURE_MISMATCH', { signatureValid: false, formatCheck: true }],
      ['an expired credential', { allChecksSuccessful: false, expiryCheck: { valid: false } }, 'EXPIRED', { signatureValid: true, notExpired: false }],
      ['a schema error', { allChecksSuccessful: false, schemaAndSignatureCheck: { valid: false, error: { errorCode: 'ERR_INVALID_SCHEMA', errorMessage: 'bad' } } }, 'INVALID', { formatCheck: false, signatureValid: true }],
      ['a failed status check', { allChecksSuccessful: false, statusCheck: [{ purpose: 'revocation', valid: false }] }, 'INVALID', { schemaCompliant: false }]
    ])('maps %s', async (_label, result, status, checks) => {
      collab({ '/vc-verification': v2(result) });
      const { body } = await post('/verify', injiBody());
      expect(body).toMatchObject({ isValid: false, verificationResult: { status, checks, verifiedClaims: {} } });
      expect(body.protocolLogs[0]).toMatchObject({ status: 'FAILED', response: { status: 200 } });
    });

    it('falls back to v1 where v2 is not deployed', async () => {
      requestMock.mockImplementation((async ({ url }: { url: string }) =>
        url.includes('/v2/') ? json(404, { error: 'Not Found' }) : json(200, { verificationStatus: 'EXPIRED' })) as any);
      const { body } = await post('/verify', injiBody());
      expect(requestMock.mock.calls.map(([c]: any[]) => c.url)).toEqual([
        'https://injiverify.collab.mosip.net/v1/verify/v2/vc-verification',
        'https://injiverify.collab.mosip.net/v1/verify/vc-verification'
      ]);
      expect(requestMock.mock.calls[1][0]).toMatchObject({ headers: { 'Content-Type': 'application/vc+ld+json' }, data: validCredential });
      expect(body.verificationResult).toMatchObject({ status: 'EXPIRED', checks: { notExpired: false } });
      expect(body.verificationResult.details).toContain('v1');
    });

    it('sends a really tampered credential and marks the step', async () => {
      collab({ '/vc-verification': v2({ allChecksSuccessful: false, expiryCheck: { valid: false } }) });
      const { body } = await post('/verify', { ...injiBody(), tamperPayload: { forceExpired: true, corruptSignature: true } });
      const sent = JSON.parse((requestMock.mock.calls[0][0] as any).data.verifiableCredential);
      expect(new Date(sent.expirationDate).getTime()).toBeLessThan(Date.now());
      expect(sent.proof.proofValue).not.toBe(validCredential.proof.proofValue);
      expect(body.protocolLogs[0].tampered).toBe(true);
    });

    it('sends an SD-JWT as its compact token', async () => {
      collab({ '/vc-verification': v2() });
      const sdJwt = (await MockProtocolService.issueCredential('sd-jwt')).issuedCredential;
      await post('/verify', { ...injiBody(), format: 'sd-jwt', credentialOrToken: sdJwt });
      expect((requestMock.mock.calls[0][0] as any).data.verifiableCredential).toBe(sdJwt.rawToken);
    });

    it.each([
      ['unreachable', unreachable()],
      ['answering HTML', { status: 200, data: '<html>', headers: { 'content-type': 'text/html' } }],
      ['failing without a result', json(502, { error: 'bad gateway' })]
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