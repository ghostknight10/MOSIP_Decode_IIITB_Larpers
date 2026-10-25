import { describe, expect, it } from 'vitest';
import {
  MOCK_ISSUER_URL,
  MOCK_VERIFIER_CLIENT_ID,
  MockProtocolService,
  NATIONAL_ID_VCT,
  claimsOf,
  disclosuresOf,
  sharedClaims
} from '../src/mocks/mockService.js';
import { decodeJwt, ldpProofProblem, mockKeys, sha256b64url, signJwt } from '../src/mocks/crypto.js';
import { present, presentToMockVerifier } from '../src/mocks/wallet.js';
import { MDOC_DOCTYPE, MDOC_NAMESPACE, mdocDocument } from '../src/mocks/mdoc.js';

const SUBJECT = { fullName: 'Priya Rao', nationalId: 'ID-1', dob: '2000-01-01', country: 'IND', email: 'p@example.org' };
const issue = async (format: 'w3c-vc' | 'sd-jwt' | 'mso-mdoc') => (await MockProtocolService.issueCredential(format, SUBJECT)).issuedCredential;
const issuerJwtOf = (token: string) => decodeJwt(token.split('~')[0])!;

describe('issuer (OpenID4VCI Draft 13)', () => {
  it('builds a pre-authorized_code credential offer and two logs', async () => {
    const { credentialOffer, logs } = await MockProtocolService.issueCredential('w3c-vc');
    expect(credentialOffer.credential_issuer).toBe(MOCK_ISSUER_URL);
    expect(credentialOffer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code']).toMatch(/^authz-code-/);
    expect(logs.map(l => l.action)).toEqual(['Fetch Credential Offer', 'Credential Request (/credential)']);
  });

  it('signs W3C credentials with Ed25519Signature2020 from a did:key issuer', async () => {
    const vc = await issue('w3c-vc');
    const { issuerEd, holderEd } = await mockKeys();
    expect(vc.issuer).toBe(issuerEd.controller);
    expect(vc.issuer).toMatch(/^did:key:z6Mk/);
    expect(vc.credentialSubject).toEqual({ id: holderEd.controller, ...SUBJECT });
    expect(vc.proof).toMatchObject({ type: 'Ed25519Signature2020', proofPurpose: 'assertionMethod' });
    expect(await ldpProofProblem(vc, 'assertion')).toBeNull();
  });

  it('detects any change to a signed W3C credential', async () => {
    const vc = await issue('w3c-vc');
    expect(await ldpProofProblem({ ...vc, credentialSubject: { ...vc.credentialSubject, fullName: 'Mallory' } }, 'assertion')).not.toBeNull();
  });

  it('fills unspecified subject claims with defaults', async () => {
    const { issuedCredential } = await MockProtocolService.issueCredential('w3c-vc', {});
    expect(issuedCredential.credentialSubject).toMatchObject({ fullName: 'Aaditya Sharma', country: 'IND' });
  });

  it('signs SD-JWTs with ES256, an x5c certificate and the holder key in cnf', async () => {
    const { issuedCredential, proofType } = await MockProtocolService.issueCredential('sd-jwt', SUBJECT);
    const jwt = issuerJwtOf(issuedCredential.rawToken);
    const { issuerEs, holderEs } = await mockKeys();
    expect(proofType).toBe('JWT (ES256)');
    expect(jwt.header).toMatchObject({ alg: 'ES256', typ: 'vc+sd-jwt', x5c: [issuerEs.certificate] });
    expect(jwt.payload).toMatchObject({ iss: MOCK_ISSUER_URL, vct: NATIONAL_ID_VCT, cnf: { jwk: holderEs.jwk }, _sd_alg: 'sha-256' });
    expect(jwt.payload).not.toHaveProperty('fullName');
    expect(issuedCredential.decoded.header.alg).toBe('ES256');
  });

  it('puts a digest of every disclosure in _sd', async () => {
    const { rawToken } = await issue('sd-jwt');
    const digests = issuerJwtOf(rawToken).payload._sd;
    const disclosures = disclosuresOf(rawToken)!;
    expect(disclosures.map(([, name]) => name).sort()).toEqual(Object.keys(SUBJECT).sort());
    expect(disclosures.every(([encoded]) => digests.includes(sha256b64url(encoded)))).toBe(true);
  });

  it.each(['w3c-vc', 'sd-jwt'] as const)('mints expired and wrong-type %s variants that are still validly signed', async format => {
    const expired: any = await MockProtocolService.mintCredential(format, SUBJECT, { expired: true });
    const wrong: any = await MockProtocolService.mintCredential(format, SUBJECT, { wrongType: true });
    if (format === 'w3c-vc') {
      expect(new Date(expired.expirationDate).getTime()).toBeLessThan(Date.now());
      expect(wrong.type).toContain('UnrelatedCredential');
      expect(await ldpProofProblem(expired, 'assertion')).toBeNull();
    } else {
      expect(issuerJwtOf(expired.rawToken).payload.exp * 1000).toBeLessThan(Date.now());
      expect(issuerJwtOf(wrong.rawToken).payload.vct).not.toBe(NATIONAL_ID_VCT);
    }
    expect(await MockProtocolService.issuedByMock(format, expired)).toBe(true);
  });
});

describe('mDoc (ISO 18013-5)', () => {
  it('issues a signed IssuerSigned structure with the issuing country of the certificate', async () => {
    const { issuedCredential, proofType } = await MockProtocolService.issueCredential('mso-mdoc', SUBJECT);
    expect(proofType).toBe('COSE_Sign1 (ES256)');
    expect(issuedCredential).toMatchObject({ format: 'mso_mdoc', decoded: { docType: MDOC_DOCTYPE, namespace: MDOC_NAMESPACE, alg: 'ES256' } });
    expect(issuedCredential.issuerSigned).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(claimsOf('mso-mdoc', issuedCredential)).toEqual({ ...SUBJECT, issuing_country: 'IN' });
    expect(await MockProtocolService.issuedByMock('mso-mdoc', issuedCredential)).toBe(true);
    expect(issuedCredential.decoded.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('asks for elements by namespace and requires limited disclosure', () => {
    const [descriptor] = MockProtocolService.presentationDefinition('mso-mdoc').input_descriptors;
    expect(descriptor.format).toEqual({ mso_mdoc: { alg: ['ES256'] } });
    expect(descriptor.constraints.limit_disclosure).toBe('required');
    expect(descriptor.constraints.fields[0].path).toEqual([`$['${MDOC_NAMESPACE}']['fullName']`]);
  });

  it('presents only the requested elements', async () => {
    const result = await presentToMockVerifier('mso-mdoc', await issue('mso-mdoc'));
    expect(result.verificationResult.verifiedClaims).toEqual({ fullName: 'Priya Rao', nationalId: 'ID-1' });
  });

  it('builds the Document form Inji Verify expects', async () => {
    const document = mdocDocument(await issue('mso-mdoc'))!;
    expect(document).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(document).not.toBe((await issue('mso-mdoc')).issuerSigned);
  });

  it('rejects a DeviceResponse that is not CBOR', async () => {
    const request = MockProtocolService.createRequest('mso-mdoc');
    const result = await MockProtocolService.checkPresentation('mso-mdoc', 'not-cbor', request);
    expect(result.verificationResult).toMatchObject({ status: 'INVALID', checks: { formatCheck: false } });
  });
});

describe('claims helpers', () => {
  it('reads claims from W3C subjects and SD-JWT disclosures', async () => {
    expect(claimsOf('w3c-vc', await issue('w3c-vc'))).toEqual(SUBJECT);
    expect(claimsOf('sd-jwt', await issue('sd-jwt'))).toEqual(SUBJECT);
  });

  it('shares only requested claims, under whichever alias was presented (G-6)', () => {
    const pd = MockProtocolService.presentationDefinition('w3c-vc');
    expect(sharedClaims(pd, SUBJECT)).toEqual({ fullName: 'Priya Rao', nationalId: 'ID-1' });
    expect(sharedClaims(pd, { fullName: 'A', UIN: '42', email: 'x' })).toEqual({ fullName: 'A', UIN: '42' });
  });

  it('asks for the format and both claim aliases in the presentation definition', () => {
    const [descriptor] = MockProtocolService.presentationDefinition('sd-jwt').input_descriptors;
    expect(descriptor.format).toHaveProperty('vc+sd-jwt');
    expect(descriptor.constraints.fields[1].path).toEqual(['$.credentialSubject.nationalId', '$.nationalId', '$.credentialSubject.UIN', '$.UIN']);
  });

  it('rejects malformed disclosures', () => {
    expect(disclosuresOf('a.b.c~!!!~')).toBeNull();
  });
});

describe('verifier (OpenID4VP Draft 21)', () => {
  it.each(['w3c-vc', 'sd-jwt', 'mso-mdoc'] as const)('accepts a clean %s presentation and shares only the requested claims', async format => {
    const result = await presentToMockVerifier(format, await issue(format));
    expect(result.isValid).toBe(true);
    expect(result.verificationResult).toMatchObject({
      status: 'VALID',
      checks: { formatCheck: true, signatureValid: true, notExpired: true, schemaCompliant: true, holderBinding: true },
      verifiedClaims: { fullName: 'Priya Rao', nationalId: 'ID-1' }
    });
    expect(result.client_id).toBe(MOCK_VERIFIER_CLIENT_ID);
  });

  it.each([
    ['w3c-vc', { forceExpired: true }, 'EXPIRED', 'notExpired'],
    ['w3c-vc', { corruptSignature: true }, 'SIGNATURE_MISMATCH', 'signatureValid'],
    ['w3c-vc', { wrongCredentialType: true }, 'INVALID', 'schemaCompliant'],
    ['w3c-vc', { replayPresentation: true }, 'INVALID', 'holderBinding'],
    ['sd-jwt', { forceExpired: true }, 'EXPIRED', 'notExpired'],
    ['sd-jwt', { corruptSignature: true }, 'SIGNATURE_MISMATCH', 'signatureValid'],
    ['sd-jwt', { wrongCredentialType: true }, 'INVALID', 'schemaCompliant'],
    ['sd-jwt', { replayPresentation: true }, 'INVALID', 'holderBinding'],
    ['mso-mdoc', { forceExpired: true }, 'EXPIRED', 'notExpired'],
    ['mso-mdoc', { corruptSignature: true }, 'SIGNATURE_MISMATCH', 'signatureValid'],
    ['mso-mdoc', { wrongCredentialType: true }, 'INVALID', 'schemaCompliant'],
    ['mso-mdoc', { replayPresentation: true }, 'INVALID', 'holderBinding']
  ] as const)('%s with %o is %s (%s fails)', async (format, tamper, status, check) => {
    const result = await presentToMockVerifier(format, await issue(format), tamper);
    expect(result.isValid).toBe(false);
    expect(result.verificationResult.status).toBe(status);
    expect((result.verificationResult.checks as Record<string, boolean>)[check]).toBe(false);
    expect(result.verificationResult.verifiedClaims).toEqual({});
    expect(result.logs[1]).toMatchObject({ status: 'FAILED', tampered: true });
  });

  it('accepts each nonce once (replaying the exact vp_token fails)', async () => {
    const vc = await issue('w3c-vc');
    const request = MockProtocolService.createRequest('w3c-vc');
    const vpToken = await present('w3c-vc', vc, request);
    expect((await MockProtocolService.checkPresentation('w3c-vc', vpToken, request)).isValid).toBe(true);
    const again = await MockProtocolService.checkPresentation('w3c-vc', vpToken, request);
    expect(again.verificationResult).toMatchObject({ status: 'INVALID', checks: { holderBinding: false } });
    expect(again.verificationResult.details).toContain('already used');
  });

  it('rejects a W3C presentation by someone other than the holder', async () => {
    const vc = await issue('w3c-vc');
    const stolen = { ...vc };
    const request = MockProtocolService.createRequest('w3c-vc');
    const vpToken: any = await present('w3c-vc', stolen, request);
    vpToken.holder = 'did:example:thief';
    const result = await MockProtocolService.checkPresentation('w3c-vc', vpToken, request);
    expect(result.verificationResult.checks.holderBinding).toBe(false);
  });

  it('discloses only the requested SD-JWT claims, with a key-binding JWT', async () => {
    const request = MockProtocolService.createRequest('sd-jwt');
    const vpToken = (await present('sd-jwt', await issue('sd-jwt'), request)) as string;
    expect(disclosuresOf(vpToken)!.map(([, name]) => name)).toEqual(['nationalId', 'fullName']);
    const kb = decodeJwt(vpToken.split('~').at(-1)!)!;
    expect(kb.header.typ).toBe('kb+jwt');
    expect(kb.payload).toMatchObject({ nonce: request.nonce, aud: MOCK_VERIFIER_CLIENT_ID });
  });

  it('rejects an SD-JWT whose key-binding JWT is signed by another key', async () => {
    const request = MockProtocolService.createRequest('sd-jwt');
    const vpToken = (await present('sd-jwt', await issue('sd-jwt'), request)) as string;
    const { issuerEs } = await mockKeys();
    const kb = decodeJwt(vpToken.split('~').at(-1)!)!;
    const forgedKb = signJwt(kb.header, kb.payload, issuerEs.privateKey);
    const forged = `${vpToken.slice(0, vpToken.lastIndexOf('~') + 1)}${forgedKb}`;
    const result = await MockProtocolService.checkPresentation('sd-jwt', forged, request);
    expect(result.verificationResult.checks.holderBinding).toBe(false);
  });

  it('rejects a disclosure the issuer never signed', async () => {
    const request = MockProtocolService.createRequest('sd-jwt');
    const vpToken = (await present('sd-jwt', await issue('sd-jwt'), request)) as string;
    const extra = Buffer.from(JSON.stringify(['salt', 'fullName', 'Mallory'])).toString('base64url');
    const [jwt, ...rest] = vpToken.split('~');
    const forged = [jwt, extra, ...rest].join('~');
    const result = await MockProtocolService.checkPresentation('sd-jwt', forged, request);
    expect(result.verificationResult).toMatchObject({ status: 'SIGNATURE_MISMATCH' });
    expect(result.verificationResult.details).toContain('fullName');
  });

  it.each([
    ['w3c-vc', undefined],
    ['w3c-vc', { verifiableCredential: [] }],
    ['sd-jwt', 'a.b.c'],
    ['sd-jwt', 'not-a-jwt~']
  ] as const)('rejects a malformed %s presentation as a format error', async (format, vpToken) => {
    const request = MockProtocolService.createRequest(format);
    const result = await MockProtocolService.checkPresentation(format, vpToken, request);
    expect(result.verificationResult).toMatchObject({ status: 'INVALID', checks: { formatCheck: false } });
  });

  it('rejects a presentation with no credential at all', async () => {
    const result = await presentToMockVerifier('w3c-vc', undefined);
    expect(result.isValid).toBe(false);
  });

  it('logs the authorization request with its nonce and the vp_token submission', async () => {
    const result = await presentToMockVerifier('w3c-vc', await issue('w3c-vc'));
    expect(result.logs.map(l => [l.step, l.action, l.status])).toEqual([
      [3, 'Authorization Request (Presentation Definition)', 'SUCCESS'],
      [4, 'VP Token Submission (/response)', 'SUCCESS']
    ]);
    expect(result.logs[0].request.url).toContain(`nonce=${result.nonce}`);
    expect(result.logs[1].request.body.vp_token.type).toEqual(['VerifiablePresentation']);
    expect(result.logs[1].tampered).toBeUndefined();
  });
});
