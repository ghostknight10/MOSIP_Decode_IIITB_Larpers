import { describe, expect, it } from 'vitest';
import { tamperCredential } from '../src/services/collab.js';
import { MockProtocolService } from '../src/mocks/mockService.js';

const payloadOf = (token: string) => JSON.parse(Buffer.from(token.split('~')[0].split('.')[1], 'base64url').toString('utf8'));

describe('tamperCredential', () => {
  const sdJwt = MockProtocolService.issueCredential('sd-jwt').issuedCredential;
  const vc = MockProtocolService.issueCredential('w3c-vc').issuedCredential;

  it('returns the credential unchanged without tamper options', () => {
    expect(tamperCredential('sd-jwt', sdJwt)).toBe(sdJwt.rawToken);
    expect(tamperCredential('w3c-vc', vc)).toEqual(vc);
  });

  it('expires and re-types an SD-JWT in its signed payload, keeping the disclosures', () => {
    const token = tamperCredential('sd-jwt', sdJwt, { forceExpired: true, wrongCredentialType: true }) as string;
    const payload = payloadOf(token);
    expect(payload.exp * 1000).toBeLessThan(Date.now());
    expect(payload.vct).not.toBe(payloadOf(sdJwt.rawToken).vct);
    expect(payload._sd).toEqual(payloadOf(sdJwt.rawToken)._sd);
    expect(token.split('~').slice(1)).toEqual(sdJwt.rawToken.split('~').slice(1));
  });

  it('corrupts only the SD-JWT signature', () => {
    const token = tamperCredential('sd-jwt', sdJwt, { corruptSignature: true }) as string;
    const [h, p, sig] = token.split('~')[0].split('.');
    const [h0, p0, sig0] = sdJwt.rawToken.split('~')[0].split('.');
    expect([h, p]).toEqual([h0, p0]);
    expect(sig).not.toBe(sig0);
  });

  it('does not mutate the W3C credential it was given', () => {
    const before = structuredClone(vc);
    const tampered = tamperCredential('w3c-vc', vc, { wrongCredentialType: true, corruptSignature: true });
    expect(vc).toEqual(before);
    expect(tampered.type).toEqual(['VerifiableCredential', 'UnrelatedCredential']);
  });

  it('leaves an undecodable token alone', () => {
    expect(tamperCredential('sd-jwt', { rawToken: 'not-a-jwt' }, { forceExpired: true })).toBe('not-a-jwt');
  });
});
