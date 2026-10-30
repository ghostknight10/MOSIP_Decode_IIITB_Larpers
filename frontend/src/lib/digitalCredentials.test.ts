import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDcRequest, digitalCredentialsSupported, explainDcError, requestViaDigitalCredentialsApi } from './digitalCredentials';

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as any).DigitalCredential;
});

const params = { presentationDefinition: { id: 'pd-1' }, clientId: 'https://verify.mock.mosip.net', nonce: 'n-1' };

describe('digitalCredentialsSupported', () => {
  it('is false without the API, true with it', () => {
    expect(digitalCredentialsSupported()).toBe(false);
    (window as any).DigitalCredential = class {};
    Object.defineProperty(navigator, 'credentials', { value: { get: vi.fn() }, configurable: true });
    expect(digitalCredentialsSupported()).toBe(true);
  });
});

describe('buildDcRequest', () => {
  it('carries the OpenID4VP request with response_mode dc_api', () => {
    expect(buildDcRequest(params)).toEqual({
      digital: {
        requests: [{ protocol: 'openid4vp', data: { response_type: 'vp_token', response_mode: 'dc_api', client_id: params.clientId, nonce: 'n-1', presentation_definition: { id: 'pd-1' } } }]
      }
    });
  });
});

describe('requestViaDigitalCredentialsApi', () => {
  it('returns the wallet response', async () => {
    const get = vi.fn().mockResolvedValue({ protocol: 'openid4vp', data: { vp_token: 'abc' } });
    Object.defineProperty(navigator, 'credentials', { value: { get }, configurable: true });
    expect(await requestViaDigitalCredentialsApi(params)).toEqual({ protocol: 'openid4vp', data: { vp_token: 'abc' } });
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ mediation: 'required', digital: expect.anything() }));
  });

  it('treats an empty answer as declined', async () => {
    Object.defineProperty(navigator, 'credentials', { value: { get: vi.fn().mockResolvedValue(null) }, configurable: true });
    await expect(requestViaDigitalCredentialsApi(params)).rejects.toMatchObject({ name: 'NotAllowedError' });
  });
});

describe('explainDcError', () => {
  it.each([
    ['NotAllowedError', /declined, or no wallet/],
    ['AbortError', /cancelled/],
    ['NotSupportedError', /no wallet for the openid4vp/],
    ['SecurityError', /https/]
  ])('explains %s', (name, message) => {
    expect(explainDcError(Object.assign(new Error('x'), { name }))).toMatch(message);
  });

  it('falls back to the browser message', () => {
    expect(explainDcError(new Error('boom'))).toBe('The browser refused the request: boom');
    expect(explainDcError(undefined)).toBe('The browser refused the request.');
  });
});
