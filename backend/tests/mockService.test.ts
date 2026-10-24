import { describe, expect, it } from 'vitest';
import { MockProtocolService } from '../src/mocks/mockService.js';

const decodeSegment = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

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
    const { issuedCredential, credentialOffer } = MockProtocolService.issueCredential('sd-jwt', { fullName: 'Priya Rao' });
    expect(credentialOffer.credential_configuration_ids).toEqual(['NationalId_SD_JWT']);
    expect(issuedCredential.format).toBe('vc+sd-jwt');

    const [jwt, ...disclosures] = issuedCredential.rawToken.split('~');
    const [header, payload, signature] = jwt.split('.');
    expect(decodeSegment(header)).toEqual({ alg: 'ES256', typ: 'vc+sd-jwt' });
    const claims = decodeSegment(payload);
    expect(claims).toMatchObject({ iss: 'https://issuer.mock.mosip.net', _sd_alg: 'sha-256', fullName: 'Priya Rao' });
    expect(claims.exp).toBeGreaterThan(claims.iat);
    expect(signature.length).toBeGreaterThan(0);
    expect(disclosures.filter(Boolean)).toHaveLength(1);
    expect(issuedCredential.decoded.payload.claims.fullName).toBe('Priya Rao');
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

  // Known bug: tamperPayload is spread into the credential subject, so the
  // tamper switches show up as claims. Flip to `it` once fixed.
  it.fails('does not leak tamper flags into the credential subject', () => {
    const { issuedCredential } = MockProtocolService.issueCredential('w3c-vc', {}, { forceExpired: true });
    expect(issuedCredential.credentialSubject).not.toHaveProperty('forceExpired');
  });
});

describe('MockProtocolService.verifyPresentation (OpenID4VP Draft 21)', () => {
  const vc = MockProtocolService.issueCredential('w3c-vc').issuedCredential;

  it('accepts an untampered credential', () => {
    const r = MockProtocolService.verifyPresentation('w3c-vc', vc);
    expect(r.isValid).toBe(true);
    expect(r.verificationResult.status).toBe('VALID');
    expect(Object.values(r.verificationResult.checks).every(Boolean)).toBe(true);
    expect(r.verificationResult.verifiedClaims).toBe(vc.credentialSubject);
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
    const { logs, presentationDefinition } = MockProtocolService.verifyPresentation('w3c-vc', vc);
    expect(logs.map(l => [l.step, l.protocol, l.status])).toEqual([[3, 'OpenID4VP', 'SUCCESS'], [4, 'OpenID4VP', 'SUCCESS']]);
    expect(logs[0].request.url).toMatch(/^openid4vp:\/\/authorize\?.*response_type=vp_token/);
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
    expect(MockProtocolService.verifyPresentation('sd-jwt', sd).verificationResult.verifiedClaims.fullName).toBe('Priya Rao');
  });

  it('falls back to sample claims when nothing is presented', () => {
    expect(MockProtocolService.verifyPresentation('w3c-vc', undefined).verificationResult.verifiedClaims).toMatchObject({ country: 'IND' });
  });

  // Known bug: any tamperPayload object counts as tampering, even with every
  // option false, so the diagram shows a tamper warning for a clean run.
  it.fails('does not flag all-false tamper options as tampered', () => {
    const [, submission] = MockProtocolService.verifyPresentation('w3c-vc', vc, { forceExpired: false, corruptSignature: false }).logs;
    expect(submission.tampered).toBe(false);
  });
});
