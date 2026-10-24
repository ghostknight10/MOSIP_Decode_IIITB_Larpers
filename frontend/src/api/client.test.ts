import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, newTransactionId } from './client';

const mockFetch = (impl: (...args: any[]) => Promise<any>) => {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
};

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

afterEach(() => vi.unstubAllGlobals());

const issueParams = {
  issuer: 'mock-openid4vci' as const,
  wallet: 'mock-wallet' as const,
  format: 'w3c-vc' as const,
  credentialSubject: { fullName: 'A', dob: '2000-01-01', nationalId: '1', email: 'a@b.c', country: 'IND' }
};

describe('newTransactionId', () => {
  it('returns tx- followed by 8 hex characters', () => {
    expect(newTransactionId()).toMatch(/^tx-[0-9a-f]{8}$/);
  });

  it('returns different ids on successive calls', () => {
    const ids = new Set(Array.from({ length: 50 }, newTransactionId));
    expect(ids.size).toBe(50);
  });
});

describe('api', () => {
  it('POSTs issue requests as JSON with the transaction id header', async () => {
    const fetchFn = mockFetch(() => jsonResponse({ success: true, issuedCredential: {} }));
    await api.issue(issueParams, 'tx-12345678');

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('/api/playground/issue');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', 'x-transaction-id': 'tx-12345678' });
    expect(JSON.parse(init.body)).toEqual(issueParams);
  });

  it('POSTs verify requests to /verify', async () => {
    const fetchFn = mockFetch(() => jsonResponse({ success: true }));
    await api.verify({ verifier: 'inji-verify', wallet: 'mock-wallet', format: 'sd-jwt', credentialOrToken: { a: 1 } }, 'tx-1');
    expect(fetchFn.mock.calls[0][0]).toBe('/api/playground/verify');
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).credentialOrToken).toEqual({ a: 1 });
  });

  it('omits the transaction header when no id is given', async () => {
    const fetchFn = mockFetch(() => jsonResponse({ status: 'healthy' }));
    await api.health();
    expect(fetchFn.mock.calls[0][1].headers).not.toHaveProperty('x-transaction-id');
  });

  it('uses GET for logs and DELETE for clearing them', async () => {
    const fetchFn = mockFetch(() => jsonResponse({ success: true, logs: [], count: 0 }));
    await api.getLogs();
    await api.clearLogs();
    expect(fetchFn.mock.calls[0][1].method).toBeUndefined();
    expect(fetchFn.mock.calls[1][1].method).toBe('DELETE');
  });

  it('returns the parsed body on success', async () => {
    mockFetch(() => jsonResponse({ success: true, issuedCredential: { id: 'vc' } }));
    await expect(api.issue(issueParams, 'tx-1')).resolves.toMatchObject({ issuedCredential: { id: 'vc' } });
  });

  it('throws ApiError with the backend message when success is false', async () => {
    mockFetch(() => jsonResponse({ success: false, error: 'Issuer exploded' }, 500));
    const err = await api.issue(issueParams, 'tx-1').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('Issuer exploded');
    expect(err.status).toBe(500);
  });

  it('throws on success:false even with HTTP 200', async () => {
    mockFetch(() => jsonResponse({ success: false, error: 'Bad format' }));
    await expect(api.issue(issueParams, 'tx-1')).rejects.toThrow('Bad format');
  });

  it('falls back to a generic message for non-JSON error bodies', async () => {
    mockFetch(() => Promise.resolve(new Response('<html>502</html>', { status: 502 })));
    await expect(api.health()).rejects.toThrow('Request to /api/health failed with HTTP 502');
  });

  it('explains when the BFF is unreachable', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(api.health()).rejects.toThrow(/Cannot reach the Playground BFF/);
  });
});
