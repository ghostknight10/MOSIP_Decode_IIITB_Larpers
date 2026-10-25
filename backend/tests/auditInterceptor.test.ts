import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAuditClient } from '../src/middleware/auditInterceptor.js';
import globalAuditBuffer from '../src/utils/RingBuffer.js';

const buffer = globalAuditBuffer as any;

const respond = (status: number, data: unknown, headers: Record<string, string> = {}) => async (config: any) => {
  const res = { data, status, statusText: String(status), headers, config };
  if (status >= 400) throw new AxiosError(`HTTP ${status}`, 'ERR_BAD_RESPONSE', config, null, res as any);
  return res;
};

const frames = (tx: string) => buffer.getByTransactionId(tx);

beforeEach(() => buffer.clearLogs());

describe('createAuditClient', () => {
  it('records a frame per call with transaction, origin and request details', async () => {
    const client = createAuditClient({ transactionId: 'tx-1', isSandbox: true, origin: 'Test' });
    await client({
      method: 'post',
      url: 'https://certify.example/credential',
      data: { format: 'ldp_vc' },
      headers: { 'X-Audit-Destination': 'INJI_CERTIFY', 'X-Audit-SpecStep': 'Credential Request' },
      adapter: respond(200, { credential: 'vc' })
    });

    const [f] = frames('tx-1');
    expect(f).toMatchObject({
      transactionId: 'tx-1',
      sequenceNo: 1,
      isSandbox: true,
      origin: 'Test',
      destination: 'INJI_CERTIFY',
      tamperFlag: null,
      protocolContext: { specStep: 'Credential Request' },
      packet: {
        request: { method: 'POST', url: 'https://certify.example/credential', body: { format: 'ldp_vc' } },
        response: { statusCode: 200, body: { credential: 'vc' } }
      }
    });
    expect(f.packet.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('numbers frames sequentially within a client', async () => {
    const client = createAuditClient({ transactionId: 'tx-2', isSandbox: false });
    await client({ url: 'https://x/1', adapter: respond(200, {}) });
    await client({ url: 'https://x/2', adapter: respond(200, {}) });
    expect(frames('tx-2').map((f: any) => [f.sequenceNo, f.packet.request.url])).toEqual([[1, 'https://x/1'], [2, 'https://x/2']]);
  });

  it('defaults origin and destination', async () => {
    await createAuditClient({ transactionId: 'tx-3', isSandbox: false })({ url: 'https://x', adapter: respond(200, {}) });
    expect(frames('tx-3')[0]).toMatchObject({ origin: 'BFF_Gateway', destination: 'UNKNOWN', protocolContext: { specStep: 'HTTP Call' } });
  });

  it('redacts secrets in request headers, request body and response body', async () => {
    await createAuditClient({ transactionId: 'tx-4', isSandbox: false })({
      method: 'post',
      url: 'https://x/token',
      data: { client_secret: 's', grant_type: 'pre-authorized_code' },
      headers: { Authorization: 'Bearer abc' },
      adapter: respond(200, { access_token: 'at', c_nonce: 'n' })
    });
    const { request, response } = frames('tx-4')[0].packet;
    expect(request.headers.Authorization).toBe('[REDACTED]');
    expect(request.body).toEqual({ client_secret: '[REDACTED]', grant_type: 'pre-authorized_code' });
    expect(response.body).toEqual({ access_token: '[REDACTED]', c_nonce: 'n' });
  });

  it('records HTTP errors and still rejects', async () => {
    const client = createAuditClient({ transactionId: 'tx-5', isSandbox: true });
    await expect(client({ url: 'https://x/missing', adapter: respond(404, { error: 'not_found' }) })).rejects.toThrow('HTTP 404');
    expect(frames('tx-5')[0].packet.response).toMatchObject({ statusCode: 404, body: { error: 'not_found' } });
  });

  it('records network failures as 500 with an empty body', async () => {
    const client = createAuditClient({ transactionId: 'tx-6', isSandbox: true });
    const adapter = async (config: any) => {
      throw new AxiosError('getaddrinfo ENOTFOUND', 'ENOTFOUND', config);
    };
    await expect(client({ url: 'https://nowhere', adapter })).rejects.toThrow('ENOTFOUND');
    expect(frames('tx-6')[0].packet.response).toMatchObject({ statusCode: 500, body: {} });
  });

  it.each([
    [{ 'X-Audit-Protocol': 'OpenID4VP' }, 'OpenID4VP', 'OpenID4VP Draft 21'],
    [{ 'X-Audit-Standard': 'Draft 21' }, 'OpenID4VP', 'OpenID4VP Draft 21'],
    [{ 'X-Audit-Protocol': 'OpenID4VCI' }, 'OpenID4VCI', 'OpenID4VCI Draft 13'],
    [{}, 'OpenID4VCI', 'OpenID4VCI Draft 13']
  ])('normalises protocol headers %o to %s', async (headers, protocol, complianceStandard) => {
    await createAuditClient({ transactionId: 'tx-p', isSandbox: false })({ url: 'https://x', headers, adapter: respond(200, {}) });
    expect(frames('tx-p')[0].protocolContext).toMatchObject({ protocol, complianceStandard });
  });

  it.each([
    ['vc+sd-jwt', 'IETF SD-JWT VC (vc+sd-jwt)'],
    ['SD-JWT', 'IETF SD-JWT VC (vc+sd-jwt)'],
    ['ldp_vc', 'W3C VC (JSON-LD)'],
    ['mso_mdoc', 'W3C VC (JSON-LD)']
  ])('normalises credential format %s to %s', async (format, expected) => {
    await createAuditClient({ transactionId: 'tx-f', isSandbox: false })({
      url: 'https://x',
      headers: { 'X-Audit-Format': format },
      adapter: respond(200, {})
    });
    expect(frames('tx-f')[0].protocolContext.credentialFormat).toBe(expected);
  });

  it('captures tamper annotations', async () => {
    await createAuditClient({ transactionId: 'tx-t', isSandbox: false })({
      url: 'https://x',
      headers: { 'X-Audit-Tampered': 'true', 'X-Audit-Tamper-Msg': 'signature flipped' },
      adapter: respond(200, {})
    });
    expect(frames('tx-t')[0].tamperFlag).toEqual({ isTampered: true, message: 'signature flipped' });
  });

  it('logs form-urlencoded requests (OpenID4VP direct_post)', async () => {
    const client = createAuditClient({ transactionId: 'tx-form', isSandbox: true });
    await client({
      method: 'post',
      url: 'https://verify.example/vp-response',
      data: 'vp_token=abc&presentation_submission=%7B%7D',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      adapter: respond(200, { status: 'ok' })
    });
    expect(frames('tx-form')).toHaveLength(1);
  });
});