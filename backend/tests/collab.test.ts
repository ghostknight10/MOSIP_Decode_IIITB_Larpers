import { describe, expect, it } from 'vitest';
import { MockProtocolService } from '../src/mocks/mockService.js';
import { decodeJwt } from '../src/mocks/crypto.js';
import { prepareCredential } from '../src/mocks/wallet.js';

const issuerPayload = (token: string) => decodeJwt(token.split('~')[0])!.payload;

describe('prepareCredential (what Inji Verify receives in tamper mode)', () => {
  it('returns the credential unchanged without tamper options', async () => {
    const vc = (await MockProtocolService.issueCredential('w3c-vc')).issuedCredential;
    expect(await prepareCredential('w3c-vc', vc)).toBe(vc);
  });

  it('asks the mock issuer for a validly signed expired credential', async () => {
    const vc = (await MockProtocolService.issueCredential('w3c-vc')).issuedCredential;
    const expired = await prepareCredential('w3c-vc', vc, { forceExpired: true });
    expect(new Date(expired.expirationDate).getTime()).toBeLessThan(Date.now());
    expect(expired.proof.proofValue).not.toBe(vc.proof.proofValue);
    expect(expired.credentialSubject).toEqual(vc.credentialSubject);
  });

  it('corrupts only the SD-JWT signature', async () => {
    const sd = (await MockProtocolService.issueCredential('sd-jwt')).issuedCredential;
    const corrupted = await prepareCredential('sd-jwt', sd, { corruptSignature: true });
    const [h, p, sig] = corrupted.rawToken.split('~')[0].split('.');
    const [h0, p0, sig0] = sd.rawToken.split('~')[0].split('.');
    expect([h, p]).toEqual([h0, p0]);
    expect(sig).not.toBe(sig0);
    expect(corrupted.rawToken.split('~').slice(1)).toEqual(sd.rawToken.split('~').slice(1));
  });

  it("edits other issuers' credentials in place, without mutating them", async () => {
    const foreign = { '@context': [], type: ['VerifiableCredential'], issuer: 'did:web:other.example', credentialSubject: { fullName: 'A' }, proof: { proofValue: 'zAbcdEFGH' } };
    const before = structuredClone(foreign);
    const edited = await prepareCredential('w3c-vc', foreign, { forceExpired: true, wrongCredentialType: true, corruptSignature: true });
    expect(foreign).toEqual(before);
    expect(edited.type).toEqual(['VerifiableCredential', 'UnrelatedCredential']);
    expect(edited.proof.proofValue).not.toBe('zAbcdEFGH');
  });

  it("expires a foreign SD-JWT in its payload and leaves an undecodable token alone", async () => {
    const payload = Buffer.from(JSON.stringify({ iss: 'x', exp: 9999999999 })).toString('base64url');
    const edited = await prepareCredential('sd-jwt', { rawToken: `e30.${payload}.sig~d1~` }, { forceExpired: true });
    expect(issuerPayload(edited.rawToken).exp * 1000).toBeLessThan(Date.now());
    expect(await prepareCredential('sd-jwt', { rawToken: 'not-a-jwt' }, { forceExpired: true })).toEqual({ rawToken: 'not-a-jwt' });
  });
});
