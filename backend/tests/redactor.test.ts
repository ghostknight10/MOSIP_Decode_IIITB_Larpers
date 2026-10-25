import { describe, expect, it } from 'vitest';
import { redactPayload } from '../src/utils/redactor.js';

describe('redactPayload', () => {
  it('passes primitives and null through', () => {
    for (const v of [null, undefined, 1, 'x', true]) expect(redactPayload(v)).toBe(v);
  });

  it.each([
    'authorization', 'Authorization', 'DPoP', 'cookie', 'Set-Cookie', 'client_secret', 'access_token', 'refresh_token', 'id_token', 'client_assertion',
    'pre-authorized_code', 'tx_code', 'user_pin', 'code', 'code_verifier', 'password', 'Proxy-Authorization', 'X-API-Key'
  ])(
    'masks %s',
    key => {
      expect(redactPayload({ [key]: 'secret', keep: 'me' })).toEqual({ [key]: '[REDACTED]', keep: 'me' });
    }
  );

  it('masks nested objects and objects inside arrays', () => {
    const input = { outer: { access_token: 't', list: [{ client_secret: 's', ok: 1 }] } };
    expect(redactPayload(input)).toEqual({ outer: { access_token: '[REDACTED]', list: [{ client_secret: '[REDACTED]', ok: 1 }] } });
  });

  it('handles top-level arrays', () => {
    expect(redactPayload([{ id_token: 'x' }, 2])).toEqual([{ id_token: '[REDACTED]' }, 2]);
  });

  it('keeps VC artefacts for the inspector', () => {
    const vp = { vp_token: { proof: { jws: 'abc' } }, credential: 'raw', proof: { proofValue: 'z' } };
    expect(redactPayload(vp)).toEqual(vp);
  });

  it('still masks secrets nested inside VC artefacts', () => {
    expect(redactPayload({ vp_token: { access_token: 'inside-vp', ok: 1 } })).toEqual({ vp_token: { access_token: '[REDACTED]', ok: 1 } });
  });

  it('masks the pre-authorized code inside a credential offer', () => {
    const offer = { grants: { 'urn:ietf:params:oauth:grant-type:pre-authorized_code': { 'pre-authorized_code': 'abc', tx_code: { length: 4 } } } };
    expect(redactPayload(offer).grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']).toEqual({ 'pre-authorized_code': '[REDACTED]', tx_code: '[REDACTED]' });
  });

  it('does not mutate its input', () => {
    const input = { authorization: 'Bearer x', nested: { cookie: 'c' } };
    const copy = structuredClone(input);
    redactPayload(input);
    expect(input).toEqual(copy);
  });

  it('keeps null values inside objects', () => {
    expect(redactPayload({ a: null })).toEqual({ a: null });
  });
});
