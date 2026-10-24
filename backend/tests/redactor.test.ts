import { describe, expect, it } from 'vitest';
import { redactPayload } from '../src/utils/redactor.js';

describe('redactPayload', () => {
  it('passes primitives and null through', () => {
    for (const v of [null, undefined, 1, 'x', true]) expect(redactPayload(v)).toBe(v);
  });

  it.each(['authorization', 'Authorization', 'DPoP', 'cookie', 'Set-Cookie', 'client_secret', 'access_token', 'refresh_token', 'id_token', 'client_assertion'])(
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

  it('keeps VC artefacts verbatim for the inspector', () => {
    const vp = { vp_token: { proof: { jws: 'abc' }, access_token: 'inside-vp' }, credential: 'raw', proof: { proofValue: 'z' } };
    expect(redactPayload(vp)).toEqual(vp);
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
