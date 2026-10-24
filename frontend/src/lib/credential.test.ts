import { describe, expect, it } from 'vitest';
import { decodeJwtPayload } from './credential';

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('decodeJwtPayload', () => {
  it('decodes the payload of a JWT', () => {
    expect(decodeJwtPayload(`${b64url({ alg: 'ES256' })}.${b64url({ iss: 'x', n: 1 })}.sig`)).toEqual({ iss: 'x', n: 1 });
  });

  it('ignores SD-JWT disclosures after the first ~', () => {
    expect(decodeJwtPayload(`${b64url({})}.${b64url({ vct: 'v' })}.sig~d1~d2~`)).toEqual({ vct: 'v' });
  });

  it('handles base64url characters', () => {
    // '>>>???' base64-encodes with '+' and '/', which base64url turns into '-' and '_'.
    const payload = { s: '>>>???' };
    expect(decodeJwtPayload(`h.${b64url(payload)}.s`)).toEqual(payload);
  });

  it('returns null for malformed tokens', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('a.%%%.c')).toBeNull();
  });
});
