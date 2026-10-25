import { describe, expect, it } from 'vitest';
import { MockProtocolService } from '../src/mocks/mockService.js';

const decodeSegment = (s: string) =>
  JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)));
const base64UrlEncode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('MockProtocolService.issueCredential (OpenID4VCI Draft 13)', () => {
  it('builds a pre-authorized_code credential offer', () => {
    const { credentialOffer } = MockProtocolService.issueCredential('w3c-vc');
    expect(credentialOffer.credential_issuer).toBe('https://issuer.mock.mosip.net');
    expect(credentialOffer.credential_configuration_ids).toEqual(['NationalId_W3C_JSONLD']);
    const grant = credentialOffer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code'];
    expect(grant['pre-authorized_code']).toMatch(/^authz-code-/);
    expect(grant.user_pin_required).toBe(false);
  });

  it('issues a W3C JSON-LD credential with an Ed25519 proof', () => {
    const { issuedCredential: vc } = MockProtocolService.issueCredential('w3c-vc', { fullName: 'Priya Rao' });
    expect(vc['@context'][0]).toBe('https://www.w3.org/2018/credentials/v1');
    expect(vc.type).toEqual(['VerifiableCredential', 'MosipNationalIdentityCredential']);
    expect(vc.id).toMatch(/^urn:uuid:/);
    expect(vc.proof).toMatchObject({ type: 'Ed25519Signature2020', proofPurpose: 'assertionMethod' });
    expect(new Date(vc.expirationDate).getTime()).toBeGreaterThan(new Date(vc.issuanceDate).getTime());
    expect(vc.credentialSubject.fullName).toBe('Priya Rao');
  });

  it('fills unspecified subject claims with defaults', () => {
    const { issuedCredential: vc } = MockProtocolService.issueCredential('w3c-vc');
    expect(vc.credentialSubject).toMatchObject({ fullName: 'Aaditya Sharma', country: 'IND', nationalId: 'MOSIP-IND-9876-5432-1098' });
  });

  it('issues an SD-JWT VC with header, payload, signature and disclosures', () => {
    const { issuedCredential, credentialOffer, proofType } = MockProtocolService.issueCredential('sd-jwt', { fullName: 'Priya Rao' });
    expect(credentialOffer.credential_configuration_ids).toEqual(['NationalId_SD_JWT']);
    expect(issuedCredential.format).toBe('vc+sd-jwt');

    const [jwt, ...disclosures] = issuedCredential.rawToken.split('~');
    const [header, payload, signature] = jwt.split('.');
    expect(decodeSegment(header)).toEqual({ alg: 'ES256', typ: 'vc+sd-jwt' });
    const claims = decodeSegment(payload);
    expect(claims).toMatchObject({ iss: 'https://issuer.mock.mosip.net', _sd_alg: 'sha-256' });
    expect(claims).not.toHaveProperty('fullName');
    expect(claims.exp).toBeGreaterThan(claims.iat);
    expect(signature.length).toBeGreaterThan(0);
    expect(disclosures.filter(Boolean)).toHaveLength(5);
    expect(decodeSegment(disclosures[0])).toEqual([
      expect.any(String),
      'nationalId',
      'MOSIP-IND-9876-5432-1098'
    ]);
    expect(issuedCredential.decoded.payload.claims.fullName).toBe('Priya Rao');
    expect(proofType).toBe('JWT (ES256)');
  });

  it.each([
    ['w3c-vc', 'ldp_vc'],
    ['sd-jwt', 'vc+sd-jwt']
  ] as const)('logs metadata fetch and credential request for %s', (format, wire) => {
    const { logs, issuedCredential } = MockProtocolService.issueCredential(format);
    expect(logs.map(l => [l.step, l.protocol, l.request.method])).toEqual([[1, 'OpenID4VCI', 'GET'], [2, 'OpenID4VCI', 'POST']]);
    expect(logs[0].request.url).toContain('/.well-known/openid-credential-issuer');
    expect(logs[1].request.body.format).toBe(wire);
    expect(logs[1].request.body.proof.proof_type).toBe('jwt');
    expect(logs[1].response.body).toBe(issuedCredential);
  });

  it('returns unique credential ids per issuance', () => {
    const a = MockProtocolService.issueCredential('w3c-vc').issuedCredential.id;
    const b = MockProtocolService.issueCredential('w3c-vc').issuedCredential.id;
    expect(a).not.toBe(b);
  });

  it('does not leak tamper flags into the credential subject', () => {
    const { issuedCredential } = MockProtocolService.issueCredential('w3c-vc', {}, { forceExpired: true });
    expect(issuedCredential.credentialSubject).not.toHaveProperty('forceExpired');
  });

  it('returns the issued proof type with the credential', () => {
    expect(MockProtocolService.issueCredential('w3c-vc').proofType).toBe('Ed25519Signature2020');
    expect(MockProtocolService.issueCredential('sd-jwt').proofType).toBe('JWT (ES256)');
  });

  it('places valid disclosure digests in _sd without cleartext subject claims', async () => {
    const { issuedCredential, proofType } = MockProtocolService.issueCredential('sd-jwt', { fullName: 'Priya Rao' });
    const [jwt, ...encodedDisclosures] = issuedCredential.rawToken.split('~');
    const [, payload] = jwt.split('.');
    const claims = decodeSegment(payload);
    const disclosures: string[] = encodedDisclosures.filter((disclosure: string) => disclosure.length > 0);
    const expectedDigests = await Promise.all(disclosures.map(async disclosure =>
      base64UrlEncode(new Uint8Array(await crypto.subtle.digest(
        'SHA-256',
        new Uint8Array(Array.from(disclosure, char => char.charCodeAt(0)))
      )))
    ));

    expect(claims._sd).toEqual(expectedDigests);
    expect(claims).not.toHaveProperty('fullName');
    expect(claims).not.toHaveProperty('nationalId');
    expect(proofType).toBe('JWT (ES256)');
  });
});

describe('MockProtocolService.verifyPresentation (OpenID4VP Draft 21)', () => {
  const vc = MockProtocolService.issueCredential('w3c-vc').issuedCredential;

  it('accepts an untampered credential', () => {
    const r = MockProtocolService.verifyPresentation('w3c-vc', vc);
    expect(r.isValid).toBe(true);
    expect(r.verificationResult.status).toBe('VALID');
    expect(Object.values(r.verificationResult.checks).every(Boolean)).toBe(true);
    expect(r.verificationResult.verifiedClaims).toEqual({
      fullName: vc.credentialSubject.fullName,
      nationalId: vc.credentialSubject.nationalId
    });
  });

  it('rejects an expired credential but keeps the signature check green', () => {
    const r = MockProtocolService.verifyPresentation('w3c-vc', vc, { forceExpired: true });
    expect(r.isValid).toBe(false);
    expect(r.verificationResult).toMatchObject({
      status: 'EXPIRED',
      checks: { notExpired: false, signatureValid: true },
      details: expect.stringContaining('expiration')
    });
  });

  it('rejects a corrupted signature', () => {
    const r = MockProtocolService.verifyPresentation('w3c-vc', vc, { corruptSignature: true });
    expect(r.verificationResult).toMatchObject({ status: 'SIGNATURE_MISMATCH', checks: { signatureValid: false, notExpired: true } });
  });

  it('reports expiry first when both tamper options are set', () => {
    const r = MockProtocolService.verifyPresentation('w3c-vc', vc, { forceExpired: true, corruptSignature: true });
    expect(r.verificationResult.status).toBe('EXPIRED');
    expect(r.verificationResult.checks).toMatchObject({ signatureValid: false, notExpired: false });
  });

  it.each([
    ['w3c-vc', 'ldp_vc'],
    ['sd-jwt', 'vc+sd-jwt']
  ] as const)('asks for %s via a presentation definition', (format, wire) => {
    const { presentationDefinition: pd } = MockProtocolService.verifyPresentation(format, vc);
    expect(pd.id).toMatch(/^pres-def-/);
    expect(pd.input_descriptors[0].format).toEqual({ [wire]: { alg: ['ES256', 'EdDSA'] } });
    expect(pd.input_descriptors[0].constraints.fields.map((f: any) => f.path[0])).toEqual([
      '$.credentialSubject.fullName',
      '$.credentialSubject.nationalId'
    ]);
  });

  it('logs the authorization request and the vp_token submission', () => {
    const { logs, presentationDefinition, client_id, nonce } = MockProtocolService.verifyPresentation('w3c-vc', vc);
    expect(logs.map(l => [l.step, l.protocol, l.status])).toEqual([[3, 'OpenID4VP', 'SUCCESS'], [4, 'OpenID4VP', 'SUCCESS']]);
    const authorizationUrl = new URL(logs[0].request.url.replace('openid4vp://', 'https://'));
    expect(authorizationUrl.searchParams.get('response_type')).toBe('vp_token');
    expect(authorizationUrl.searchParams.get('client_id')).toBe(client_id);
    expect(authorizationUrl.searchParams.get('nonce')).toBe(nonce);
    expect(client_id).toBe('https://verify.mock.mosip.net');
    expect(nonce).toMatch(/^[0-9a-f-]{36}$/);
    expect(logs[0].response.body).toBe(presentationDefinition);
    expect(logs[1].request.body.vp_token).toBe(vc);
    expect(logs[1].tampered).toBe(false);
  });

  it('marks the submission as failed and tampered on negative paths', () => {
    const [, submission] = MockProtocolService.verifyPresentation('w3c-vc', vc, { corruptSignature: true }).logs;
    expect(submission).toMatchObject({ status: 'FAILED', response: { status: 400 }, tampered: true });
  });

  it('reads verified claims from SD-JWT decoded payloads', () => {
    const sd = MockProtocolService.issueCredential('sd-jwt', { fullName: 'Priya Rao' }).issuedCredential;
    expect(MockProtocolService.verifyPresentation('sd-jwt', sd).verificationResult.verifiedClaims).toEqual({
      fullName: 'Priya Rao',
      nationalId: 'MOSIP-IND-9876-5432-1098'
    });
  });

  it('rejects a presentation with no credential', () => {
    const { isValid, verificationResult } = MockProtocolService.verifyPresentation('w3c-vc', undefined);
    expect(isValid).toBe(false);
    expect(verificationResult).toMatchObject({ status: 'INVALID', checks: { formatCheck: false }, verifiedClaims: {} });
  });

  describe('SD-JWT disclosures', () => {
    const issued = () => MockProtocolService.issueCredential('sd-jwt').issuedCredential;
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

    it('accepts the disclosures the issuer signed', () => {
      const { isValid, verificationResult } = MockProtocolService.verifyPresentation('sd-jwt', issued());
      expect(isValid).toBe(true);
      expect(verificationResult.verifiedClaims).toEqual({ fullName: 'Aaditya Sharma', nationalId: 'MOSIP-IND-9876-5432-1098' });
    });

    it('rejects a disclosure whose digest is not in _sd', () => {
      const { rawToken } = issued();
      const forged = `${rawToken}${encode(['salt', 'fullName', 'Mallory'])}~`;
      const { isValid, verificationResult } = MockProtocolService.verifyPresentation('sd-jwt', { rawToken: forged });
      expect(isValid).toBe(false);
      expect(verificationResult).toMatchObject({ status: 'SIGNATURE_MISMATCH', checks: { signatureValid: false }, verifiedClaims: {} });
      expect(verificationResult.details).toContain('fullName');
    });

    it('rejects disclosures attached to a made-up issuer JWT', () => {
      const result = MockProtocolService.verifyPresentation('sd-jwt', { rawToken: `x.y.z~${encode(['s', 'fullName', 'Mallory'])}~` });
      expect(result.isValid).toBe(false);
    });

    it('skips a trailing key-binding JWT instead of crashing', () => {
      const withKb = `${issued().rawToken}eyJhbGciOiJFUzI1NiJ9.e30.sig`;
      expect(MockProtocolService.verifyPresentation('sd-jwt', { rawToken: withKb }).isValid).toBe(true);
    });

    it.each([
      ['no token', {}],
      ['a token without disclosures separator', { rawToken: 'a.b.c' }],
      ['an undecodable disclosure', { rawToken: 'a.e30.c~!!!~' }]
    ])('rejects %s as a format error', (_label, presented) => {
      expect(MockProtocolService.verifyPresentation('sd-jwt', presented).verificationResult).toMatchObject({
        status: 'INVALID',
        checks: { formatCheck: false }
      });
    });
  });

  it('does not flag all-false tamper options as tampered', () => {
    const [, submission] = MockProtocolService.verifyPresentation('w3c-vc', vc, { forceExpired: false, corruptSignature: false }).logs;
    expect(submission.tampered).toBe(false);
  });

  it('shares only requested claims from the credential subject', () => {
    const { verificationResult } = MockProtocolService.verifyPresentation('w3c-vc', vc);
    expect(verificationResult.verifiedClaims).toEqual({
      fullName: vc.credentialSubject.fullName,
      nationalId: vc.credentialSubject.nationalId
    });
    expect(verificationResult.verifiedClaims).not.toHaveProperty('country');
  });

  it('rejects a credential with the wrong credential type', () => {
    const result = MockProtocolService.verifyPresentation('w3c-vc', vc, { wrongCredentialType: true });
    expect(result.isValid).toBe(false);
    expect(result.verificationResult).toMatchObject({
      status: 'INVALID',
      checks: { formatCheck: false },
      details: expect.stringContaining('Credential type check failed')
    });
    expect(result.logs[1].tampered).toBe(true);
  });
});
