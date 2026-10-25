import { v4 as uuidv4 } from 'uuid';
import { CredentialFormat, ProtocolLog } from '../types/index.js';
import { MDOC_NAMESPACE, checkMdocPresentation, mdocClaims, mdocIssuedByMock, mintMdoc } from './mdoc.js';
import {
  CREDENTIALS_V1,
  ED25519_2020_CONTEXT,
  PLAYGROUND_CONTEXT,
  decodeJwt,
  jwtSignatureValid,
  ldpProofProblem,
  mockKeys,
  sha256b64url,
  signCredential,
  signJwt,
  x5cPublicKey
} from './crypto.js';

export const MOCK_ISSUER_URL = 'https://issuer.mock.mosip.net';
export const MOCK_VERIFIER_CLIENT_ID = 'https://verify.mock.mosip.net';
export const NATIONAL_ID_TYPE = 'MosipNationalIdentityCredential';
export const NATIONAL_ID_VCT = 'https://schema.mosip.net/credentials/national-id/v1';
const UNRELATED_VCT = 'https://schema.mosip.net/credentials/unrelated/v1';
const DAY_MS = 86_400_000;

/**
 * Requested claims and the names other issuers use for them (G-6): a real Inji
 * Certify credential carries the national ID as UIN.
 */
export const REQUESTED_CLAIMS: Record<string, string[]> = {
  fullName: ['fullName'],
  nationalId: ['nationalId', 'UIN']
};

export type Subject = Record<string, unknown>;
export interface MintOptions {
  /** Issued two days ago, expired yesterday. */
  expired?: boolean;
  /** A valid credential of an unrelated type. */
  wrongType?: boolean;
}

export type VerificationStatus = 'VALID' | 'INVALID' | 'EXPIRED' | 'SIGNATURE_MISMATCH';
type Check = 'formatCheck' | 'signatureValid' | 'notExpired' | 'schemaCompliant' | 'holderBinding';

/** Last segment of a JSONPath: $.credentialSubject.fullName or $['org.ns']['fullName']. */
export const claimFromPath = (path: string) => {
  const brackets = [...path.matchAll(/\['([^']+)'\]/g)];
  return brackets.length ? brackets.at(-1)![1] : path.split('.').pop()!;
};

/** The presented claims the presentation definition asks for, under whichever alias was presented. */
export function sharedClaims(presentationDefinition: any, claims: Subject) {
  const fields: { path: string[] }[] = presentationDefinition.input_descriptors[0].constraints.fields;
  return Object.fromEntries(
    fields.flatMap(field => {
      const name = field.path.map(claimFromPath).find(claim => claim in claims);
      return name ? [[name, claims[name]]] : [];
    })
  );
}

/** Disclosures of an SD-JWT as [encoded, claim name, value]; null if one is malformed. */
export function disclosuresOf(token: string): [string, string, unknown][] | null {
  const parts = token.split('~').slice(1).filter(part => part && !part.includes('.'));
  const decoded: [string, string, unknown][] = [];
  for (const encoded of parts) {
    try {
      const value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      if (!Array.isArray(value) || value.length !== 3 || typeof value[1] !== 'string') return null;
      decoded.push([encoded, value[1], value[2]]);
    } catch {
      return null;
    }
  }
  return decoded;
}

/** The subject claims a credential carries (W3C credentialSubject, or SD-JWT disclosures). */
export function claimsOf(format: CredentialFormat, credential: any): Subject {
  if (format === 'mso-mdoc') return mdocClaims(credential);
  if (format === 'sd-jwt') {
    const token = typeof credential === 'string' ? credential : credential?.rawToken;
    return Object.fromEntries((typeof token === 'string' ? disclosuresOf(token) ?? [] : []).map(([, name, value]) => [name, value]));
  }
  const { id: _holder, ...claims } = credential?.credentialSubject ?? {};
  return claims;
}

/* ----- Verifier state (S-1): single-use nonces ----- */

export interface PresentationRequest {
  presentationDefinition: any;
  client_id: string;
  nonce: string;
}

const NONCE_TTL_MS = 10 * 60_000;
const pending = new Map<string, { request: PresentationRequest; expires: number }>();

function takeNonce(nonce: unknown): PresentationRequest | null {
  const now = Date.now();
  for (const [key, entry] of pending) if (entry.expires < now) pending.delete(key);
  if (typeof nonce !== 'string') return null;
  const entry = pending.get(nonce);
  pending.delete(nonce); // single use, whatever the outcome
  return entry?.request ?? null;
}

interface Verdict {
  status: VerificationStatus;
  failed?: Check;
  details: string;
  claims: Subject;
}

const reject = (failed: Check, details: string): Verdict => ({
  status: failed === 'signatureValid' ? 'SIGNATURE_MISMATCH' : failed === 'notExpired' ? 'EXPIRED' : 'INVALID',
  failed,
  details,
  claims: {}
});

async function checkLdpPresentation(vp: any, nonce: string, clientId: string): Promise<Verdict> {
  const credential = Array.isArray(vp?.verifiableCredential) ? vp.verifiableCredential[0] : vp?.verifiableCredential;
  if (!vp?.type?.includes?.('VerifiablePresentation') || !credential?.credentialSubject) {
    return reject('formatCheck', 'Expected a W3C verifiable presentation containing a credential.');
  }
  if (vp.proof?.challenge !== nonce) {
    return reject('holderBinding', 'The presentation was not made for this request: its challenge is not the nonce the verifier issued (replayed or stale presentation).');
  }
  const vpProblem = await ldpProofProblem(vp, { challenge: nonce, domain: clientId });
  if (vpProblem) return reject('holderBinding', `Presentation proof failed: ${vpProblem}`);
  if (!credential.credentialSubject.id) {
    return reject('holderBinding', 'The credential is not bound to a holder (no credentialSubject.id), so possession cannot be proved.');
  }
  if (vp.holder !== credential.credentialSubject.id) {
    return reject('holderBinding', 'The presenter is not the holder the credential was issued to.');
  }
  const vcProblem = await ldpProofProblem(credential, 'assertion');
  if (vcProblem) return reject('signatureValid', `Credential proof failed: ${vcProblem}`);
  const { issuerEd } = await mockKeys();
  const issuer = typeof credential.issuer === 'string' ? credential.issuer : credential.issuer?.id;
  if (issuer !== issuerEd.controller) return reject('signatureValid', `Issuer ${issuer} is not in the verifier's trust list.`);
  if (credential.expirationDate && new Date(credential.expirationDate).getTime() < Date.now()) {
    return reject('notExpired', `Credential expired on ${credential.expirationDate}.`);
  }
  if (!credential.type?.includes?.(NATIONAL_ID_TYPE)) {
    return reject('schemaCompliant', `Credential type ${JSON.stringify(credential.type)} is not a ${NATIONAL_ID_TYPE}.`);
  }
  return { status: 'VALID', details: '', claims: claimsOf('w3c-vc', credential) };
}

async function checkSdJwtPresentation(token: unknown, nonce: string, clientId: string): Promise<Verdict> {
  if (typeof token !== 'string' || !token.includes('~')) {
    return reject('formatCheck', 'No SD-JWT presented: expected <issuer-jwt>~<disclosure>~...~<kb-jwt>.');
  }
  const segments = token.split('~');
  const issuerJwt = decodeJwt(segments[0]);
  if (!issuerJwt) return reject('formatCheck', 'Malformed SD-JWT: the issuer JWT could not be decoded.');
  const disclosures = disclosuresOf(token);
  if (!disclosures) return reject('formatCheck', 'Malformed SD-JWT disclosure.');

  const issuerKey = x5cPublicKey(issuerJwt.header);
  if (!issuerKey || !jwtSignatureValid(issuerJwt, issuerKey.key)) {
    return reject('signatureValid', 'The issuer signature does not verify against the x5c certificate.');
  }
  const { issuerEs } = await mockKeys();
  if (issuerKey.certificate !== issuerEs.certificate) {
    return reject('signatureValid', "The issuer certificate is not in the verifier's trust list.");
  }
  const digests = new Set(Array.isArray(issuerJwt.payload._sd) ? issuerJwt.payload._sd : []);
  const forged = disclosures.find(([encoded]) => !digests.has(sha256b64url(encoded)));
  if (forged) return reject('signatureValid', `Disclosure for "${forged[1]}" is not covered by the issuer's _sd digests.`);

  // Key binding: the last segment proves the holder made this presentation for this request.
  const kb = decodeJwt(segments.at(-1) ?? '');
  const presented = token.slice(0, token.lastIndexOf('~') + 1);
  if (!kb || kb.header.typ !== 'kb+jwt') return reject('holderBinding', 'No key-binding JWT: the holder did not prove possession.');
  if (!issuerJwt.payload.cnf?.jwk || !jwtSignatureValid(kb, issuerJwt.payload.cnf.jwk)) {
    return reject('holderBinding', "The key-binding JWT is not signed by the credential's holder key (cnf).");
  }
  if (kb.payload.nonce !== nonce || kb.payload.aud !== clientId) {
    return reject('holderBinding', 'The presentation was not made for this request: its nonce or audience does not match (replayed or stale presentation).');
  }
  if (kb.payload.sd_hash !== sha256b64url(presented)) return reject('holderBinding', 'The key-binding JWT does not cover the presented disclosures.');

  if (typeof issuerJwt.payload.exp === 'number' && issuerJwt.payload.exp * 1000 < Date.now()) {
    return reject('notExpired', `Credential expired on ${new Date(issuerJwt.payload.exp * 1000).toISOString()}.`);
  }
  if (issuerJwt.payload.vct !== NATIONAL_ID_VCT) return reject('schemaCompliant', `Credential type ${issuerJwt.payload.vct} is not a national ID.`);
  return { status: 'VALID', details: '', claims: Object.fromEntries(disclosures.map(([, name, value]) => [name, value])) };
}

export const WIRE_FORMAT: Record<CredentialFormat, string> = { 'w3c-vc': 'ldp_vc', 'sd-jwt': 'vc+sd-jwt', 'mso-mdoc': 'mso_mdoc' };
export const MOCK_RESPONSE_URI = `${MOCK_VERIFIER_CLIENT_ID}/vp-response`;

async function checkMdoc(vpToken: unknown, request: PresentationRequest): Promise<Verdict> {
  const { problem, claims } = await checkMdocPresentation(vpToken, request, MOCK_RESPONSE_URI);
  return problem ? reject(problem.check, problem.message) : { status: 'VALID', details: '', claims };
}

export class MockProtocolService {
  /** Signs a credential with the mock issuer's keys. Used for issuance and by the wallet's tamper options. */
  public static async mintCredential(format: CredentialFormat, subject: Subject, { expired = false, wrongType = false }: MintOptions = {}) {
    const keys = await mockKeys();
    if (format === 'mso-mdoc') return mintMdoc(subject, { expired, wrongType });
    const issuedAt = Date.now() - (expired ? 2 * DAY_MS : 0);
    const expiresAt = expired ? Date.now() - DAY_MS : issuedAt + 365 * DAY_MS;

    if (format === 'sd-jwt') {
      const disclosures = Object.entries(subject).map(([claim, value]) => Buffer.from(JSON.stringify([uuidv4(), claim, value])).toString('base64url'));
      const header = { alg: 'ES256', typ: 'vc+sd-jwt' };
      const payload = {
        iss: MOCK_ISSUER_URL,
        iat: Math.floor(issuedAt / 1000),
        nbf: Math.floor(issuedAt / 1000),
        exp: Math.floor(expiresAt / 1000),
        vct: wrongType ? UNRELATED_VCT : NATIONAL_ID_VCT,
        cnf: { jwk: keys.holderEs.jwk },
        _sd_alg: 'sha-256',
        _sd: disclosures.map(sha256b64url)
      };
      const jwt = signJwt({ ...header, x5c: [keys.issuerEs.certificate] }, payload, keys.issuerEs.privateKey);
      return {
        format: 'vc+sd-jwt',
        rawToken: `${jwt}~${disclosures.join('~')}~`,
        decoded: { header, payload: { iss: payload.iss, vct: payload.vct, exp: payload.exp, claims: subject } }
      };
    }

    return signCredential({
      '@context': [CREDENTIALS_V1, ED25519_2020_CONTEXT, PLAYGROUND_CONTEXT],
      id: `urn:uuid:${uuidv4()}`,
      type: ['VerifiableCredential', wrongType ? 'UnrelatedCredential' : NATIONAL_ID_TYPE],
      issuer: keys.issuerEd.controller,
      issuanceDate: new Date(issuedAt).toISOString(),
      expirationDate: new Date(expiresAt).toISOString(),
      credentialSubject: { id: keys.holderEd.controller, ...subject }
    });
  }

  /** True when the mock issuer signed this credential (so the wallet can ask it for a variant). */
  public static async issuedByMock(format: CredentialFormat, credential: any) {
    if (format === 'mso-mdoc') return mdocIssuedByMock(credential);
    const keys = await mockKeys();
    if (format === 'sd-jwt') {
      const token = typeof credential === 'string' ? credential : credential?.rawToken;
      const header = typeof token === 'string' ? decodeJwt(token.split('~')[0])?.header : undefined;
      return header?.x5c?.[0] === keys.issuerEs.certificate;
    }
    const issuer = typeof credential?.issuer === 'string' ? credential.issuer : credential?.issuer?.id;
    return issuer === keys.issuerEd.controller;
  }

  /**
   * OpenID4VCI Draft 13: a pre-authorized credential offer and a signed credential.
   */
  public static async issueCredential(format: CredentialFormat, subjectData: Record<string, string> = {}) {
    const subject = {
      nationalId: subjectData.nationalId || 'MOSIP-IND-9876-5432-1098',
      fullName: subjectData.fullName || 'Aaditya Sharma',
      dob: subjectData.dob || '1995-08-15',
      country: subjectData.country || 'IND',
      email: subjectData.email || 'aaditya.sharma@example.org'
    };

    const credentialOffer = {
      credential_issuer: MOCK_ISSUER_URL,
      credential_configuration_ids: [{ 'w3c-vc': 'NationalId_W3C_JSONLD', 'sd-jwt': 'NationalId_SD_JWT', 'mso-mdoc': 'NationalId_mDoc' }[format]],
      grants: {
        'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
          'pre-authorized_code': `authz-code-${uuidv4().substring(0, 8)}`,
          user_pin_required: false
        }
      }
    };

    const issuedCredential: any = await MockProtocolService.mintCredential(format, subject);

    const log1: ProtocolLog = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      step: 1,
      sender: 'Wallet',
      receiver: 'Issuer (OpenID4VCI)',
      protocol: 'OpenID4VCI',
      action: 'Fetch Credential Offer',
      status: 'SUCCESS',
      request: { method: 'GET', url: `${MOCK_ISSUER_URL}/.well-known/openid-credential-issuer` },
      response: { status: 200, body: credentialOffer },
      durationMs: 42
    };

    const log2: ProtocolLog = {
      id: uuidv4(),
      timestamp: new Date(Date.now() + 50).toISOString(),
      step: 2,
      sender: 'Wallet',
      receiver: 'Issuer (OpenID4VCI)',
      protocol: 'OpenID4VCI',
      action: 'Credential Request (/credential)',
      status: 'SUCCESS',
      request: {
        method: 'POST',
        url: `${MOCK_ISSUER_URL}/credential`,
        headers: { 'Content-Type': 'application/json' },
        body: {
          format: WIRE_FORMAT[format],
          proof: { proof_type: 'jwt', jwt: 'eyJhbGciOiJFUzI1NiIsIn...' }
        }
      },
      response: { status: 200, body: issuedCredential },
      durationMs: 78
    };

    return {
      credentialOffer,
      issuedCredential,
      proofType: format === 'sd-jwt' ? 'JWT (ES256)' : format === 'mso-mdoc' ? 'COSE_Sign1 (ES256)' : issuedCredential.proof.type,
      logs: [log1, log2]
    };
  }

  /** OpenID4VP Draft 21 presentation definition: fullName and the national ID (or UIN). */
  public static presentationDefinition(format: CredentialFormat) {
    return {
      id: `pres-def-${uuidv4().substring(0, 8)}`,
      input_descriptors: [
        {
          id: 'national_id_credential',
          name: 'National Identity Proof',
          purpose: 'Verify age, identity, and citizenship without leaking unwanted attributes',
          format: { [WIRE_FORMAT[format]]: { alg: format === 'w3c-vc' ? ['EdDSA', 'ES256'] : ['ES256'] } },
          constraints: {
            ...(format === 'mso-mdoc' ? { limit_disclosure: 'required' } : {}),
            fields: Object.values(REQUESTED_CLAIMS).map(names => ({
              // mDoc elements are addressed as $['namespace']['element'] (ISO 18013-7).
              path: names.flatMap(name =>
                format === 'mso-mdoc' ? [`$['${MDOC_NAMESPACE}']['${name}']`] : [`$.credentialSubject.${name}`, `$.${name}`]
              ),
              ...(format === 'mso-mdoc' ? { intent_to_retain: false } : { filter: { type: 'string' } })
            }))
          }
        }
      ]
    };
  }

  /** Authorization request: a presentation definition and a fresh single-use nonce. */
  public static createRequest(format: CredentialFormat): PresentationRequest {
    const request = { presentationDefinition: MockProtocolService.presentationDefinition(format), client_id: MOCK_VERIFIER_CLIENT_ID, nonce: uuidv4() };
    pending.set(request.nonce, { request, expires: Date.now() + NONCE_TTL_MS });
    return request;
  }

  /**
   * Verifies a presentation for a request this verifier issued: holder proof
   * bound to the nonce, issuer signature and trust, disclosures, expiry, type.
   */
  public static async checkPresentation(format: CredentialFormat, vpToken: unknown, request: PresentationRequest, tampered = false) {
    const issued = takeNonce(request.nonce);
    const verdict: Verdict = !issued
      ? reject('holderBinding', 'Unknown or already used nonce: this request was answered before (replay).')
      : format === 'sd-jwt'
        ? await checkSdJwtPresentation(vpToken, issued.nonce, issued.client_id)
        : format === 'mso-mdoc'
          ? await checkMdoc(vpToken, issued)
          : await checkLdpPresentation(vpToken, issued.nonce, issued.client_id);

    const isValid = verdict.status === 'VALID';
    const checks = {
      formatCheck: verdict.failed !== 'formatCheck',
      signatureValid: verdict.failed !== 'signatureValid',
      notExpired: verdict.failed !== 'notExpired',
      schemaCompliant: verdict.failed !== 'schemaCompliant',
      holderBinding: verdict.failed !== 'holderBinding'
    };
    const verificationResult = {
      status: verdict.status,
      checks,
      details: isValid
        ? 'Holder proof bound to this request, issuer signature, selective disclosures, expiry and credential type all verified.'
        : verdict.details,
      verifiedClaims: isValid ? sharedClaims(request.presentationDefinition, verdict.claims) : {}
    };

    const authorizationRequest: ProtocolLog = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      step: 3,
      sender: 'Verifier (OpenID4VP)',
      receiver: 'Wallet',
      protocol: 'OpenID4VP',
      action: 'Authorization Request (Presentation Definition)',
      status: 'SUCCESS',
      request: {
        method: 'GET',
        url: `openid4vp://authorize?${new URLSearchParams({ client_id: request.client_id, nonce: request.nonce, response_type: 'vp_token', response_mode: 'direct_post' }).toString()}`
      },
      response: { status: 200, body: request.presentationDefinition },
      durationMs: 35
    };
    const submission: ProtocolLog = {
      id: uuidv4(),
      timestamp: new Date(Date.now() + 60).toISOString(),
      step: 4,
      sender: 'Wallet',
      receiver: 'Verifier (OpenID4VP)',
      protocol: 'OpenID4VP',
      action: 'VP Token Submission (/response)',
      status: isValid ? 'SUCCESS' : 'FAILED',
      request: {
        method: 'POST',
        url: MOCK_RESPONSE_URI,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: { vp_token: vpToken ?? null, presentation_submission: { definition_id: request.presentationDefinition.id } }
      },
      response: { status: isValid ? 200 : 400, body: verificationResult },
      durationMs: 110,
      ...(tampered ? { tampered: true } : {})
    };

    return {
      isValid,
      verificationResult,
      presentationDefinition: request.presentationDefinition,
      client_id: request.client_id,
      nonce: request.nonce,
      logs: [authorizationRequest, submission]
    };
  }
}
