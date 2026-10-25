import 'reflect-metadata'; // required by @peculiar/x509, before it loads
import { createHash, createPublicKey, KeyObject, sign as nodeSign, verify as nodeVerify, webcrypto, X509Certificate } from 'node:crypto';
import * as x509 from '@peculiar/x509';
import * as vc from '@digitalbazaar/vc';
import jsigs from 'jsonld-signatures';
import * as didKey from '@digitalbazaar/did-method-key';
import { Ed25519VerificationKey2020 } from '@digitalbazaar/ed25519-verification-key-2020';
import { Ed25519Signature2020 } from '@digitalbazaar/ed25519-signature-2020';
import * as credentialsContext from '@digitalbazaar/credentials-context';
import ed25519Context from 'ed25519-signature-2020-context';

/**
 * Real keys and signatures for the mock engine (M-1). The mock issuer signs W3C
 * credentials with Ed25519Signature2020 (did:key) and SD-JWTs with ES256 (an
 * X.509 certificate in x5c), which Inji Verify accepts. The mock wallet holds
 * its own keys for presentation proofs and key-binding JWTs (S-1). Keys are
 * generated once per process.
 */

export const CREDENTIALS_V1 = 'https://www.w3.org/2018/credentials/v1';
export const ED25519_2020_CONTEXT = ed25519Context.CONTEXT_URL as string;
const VOCAB = 'https://playground.mosip.example/vocab#';

/** Inline JSON-LD context for the playground's claims, so nothing needs hosting. */
export const PLAYGROUND_CONTEXT = {
  MosipNationalIdentityCredential: `${VOCAB}MosipNationalIdentityCredential`,
  UnrelatedCredential: `${VOCAB}UnrelatedCredential`,
  fullName: 'https://schema.org/name',
  nationalId: 'https://schema.org/identifier',
  dob: 'https://schema.org/birthDate',
  email: 'https://schema.org/email',
  country: 'https://schema.org/addressCountry'
};

const CONTEXTS = new Map<string, unknown>([
  [CREDENTIALS_V1, credentialsContext.contexts.get(CREDENTIALS_V1)],
  [ED25519_2020_CONTEXT, ed25519Context.CONTEXT]
]);

const didKeyDriver = didKey.driver();
didKeyDriver.use({ multibaseMultikeyHeader: 'z6Mk', fromMultibase: Ed25519VerificationKey2020.from });

/**
 * MOSIP publishes its JSON-LD contexts and Collab issuer DID documents on
 * inji.github.io; only that origin is ever fetched (cached, 5 s timeout), so a
 * credential can't make the BFF call arbitrary URLs.
 */
const MOSIP_DOCUMENTS = /^https:\/\/inji\.github\.io\/inji-config\/[\w./-]+$/;
const MOSIP_DID_WEB = /^did:web:inji\.github\.io(:[\w-]+)+$/;
const fetched = new Map<string, Promise<any>>();
const fetchJson = (url: string) => {
  if (!fetched.has(url)) {
    const request = fetch(url, { signal: AbortSignal.timeout(5000) }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.json();
    });
    request.catch(() => fetched.delete(url)); // retry next time
    fetched.set(url, request);
  }
  return fetched.get(url)!;
};

async function resolveDidWeb(url: string) {
  const [did] = url.split('#');
  const document = await fetchJson(`https://${did.slice('did:web:'.length).split(':').join('/')}/did.json`);
  if (url === did) return document;
  const method = (document.verificationMethod ?? []).find((vm: any) => vm.id === url || `${did}${vm.id}` === url);
  if (!method) throw new Error(`Verification method ${url} not found in ${did}`);
  return { '@context': document['@context'], ...method };
}

/** Bundled contexts, did:key, and MOSIP's published documents on inji.github.io. */
export const documentLoader = async (url: string) => {
  const document = CONTEXTS.get(url);
  if (document) return { contextUrl: null, documentUrl: url, document };
  if (url.startsWith('did:key:')) return { contextUrl: null, documentUrl: url, document: await didKeyDriver.get({ url }) };
  if (MOSIP_DID_WEB.test(url.split('#')[0])) return { contextUrl: null, documentUrl: url, document: await resolveDidWeb(url) };
  if (MOSIP_DOCUMENTS.test(url)) return { contextUrl: null, documentUrl: url, document: await fetchJson(url) };
  throw new Error(`Unsupported JSON-LD document or verification method: ${url}`);
};

/** Country of the mock issuer (ISO 3166-1 alpha-2), in its certificate and its mDocs. */
export const ISSUING_COUNTRY = 'IN';

const ES256 = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const;
x509.cryptoProvider.set(webcrypto as any);

async function ed25519Did() {
  const key = await Ed25519VerificationKey2020.generate();
  const fingerprint = key.fingerprint();
  key.controller = `did:key:${fingerprint}`;
  key.id = `${key.controller}#${fingerprint}`;
  return key;
}

async function p256(withCertificate: string | null) {
  const pair = (await webcrypto.subtle.generateKey(ES256, true, ['sign', 'verify'])) as webcrypto.CryptoKeyPair;
  const privateKey = KeyObject.from(pair.privateKey);
  const { kty, crv, x, y } = KeyObject.from(pair.publicKey).export({ format: 'jwk' });
  const certificate = withCertificate
    ? Buffer.from(
        (
          await x509.X509CertificateGenerator.createSelfSigned({
            serialNumber: '01',
            // C= is the issuing country; mDoc verifiers match it to issuing_country (ISO 18013-5).
            name: `CN=${withCertificate}, C=${ISSUING_COUNTRY}`,
            notBefore: new Date(Date.now() - 86_400_000),
            notAfter: new Date(Date.now() + 365 * 86_400_000),
            keys: pair,
            signingAlgorithm: ES256
          })
        ).rawData
      ).toString('base64')
    : null;
  return { privateKey, jwk: { kty, crv, x, y } as Record<string, string>, certificate };
}

async function createKeys() {
  const [issuerEd, holderEd, issuerEs, holderEs] = await Promise.all([
    ed25519Did(),
    ed25519Did(),
    p256('Playground mock OpenID4VCI issuer'),
    p256(null)
  ]);
  return { issuerEd, holderEd, issuerEs, holderEs };
}

let keys: ReturnType<typeof createKeys> | undefined;
export const mockKeys = () => (keys ??= createKeys());

/* ----- Data Integrity (W3C VC, Ed25519Signature2020) ----- */

export async function signCredential(credential: Record<string, unknown>) {
  const { issuerEd } = await mockKeys();
  return vc.issue({ credential, suite: new Ed25519Signature2020({ key: issuerEd }), documentLoader });
}

export async function signPresentation(credential: unknown, challenge: string, domain: string) {
  const { holderEd } = await mockKeys();
  // VC Data Model 1.1, like the credentials (vc.createPresentation defaults to 2.0).
  const presentation = {
    '@context': [CREDENTIALS_V1, ED25519_2020_CONTEXT],
    type: ['VerifiablePresentation'],
    holder: holderEd.controller,
    verifiableCredential: [credential]
  };
  return vc.signPresentation({ presentation, suite: new Ed25519Signature2020({ key: holderEd }), challenge, domain, documentLoader });
}

/** Checks one Data Integrity proof; null when it verifies, else the reason. */
export async function ldpProofProblem(document: any, purpose: 'assertion' | { challenge: string; domain: string }) {
  try {
    const proofPurpose =
      purpose === 'assertion'
        ? new jsigs.purposes.AssertionProofPurpose()
        : new jsigs.purposes.AuthenticationProofPurpose({ challenge: purpose.challenge, domain: purpose.domain });
    const result = await jsigs.verify(document, { suite: new Ed25519Signature2020(), purpose: proofPurpose, documentLoader });
    if (result.verified) return null;
    const error = result.error?.errors?.[0] ?? result.error;
    return String(error?.message ?? 'proof did not verify');
  } catch (err: any) {
    return String(err?.message ?? err);
  }
}

/* ----- JWT (SD-JWT VC and key binding, ES256) ----- */

const b64url = (value: unknown) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
export const sha256b64url = (value: string) => createHash('sha256').update(value).digest('base64url');

export function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKey: KeyObject) {
  const input = `${b64url(header)}.${b64url(payload)}`;
  return `${input}.${nodeSign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}

export function decodeJwt(jwt: string): { header: any; payload: any; signature: string; input: string } | null {
  const [header, payload, signature] = jwt.split('.');
  if (!header || !payload || signature === undefined) return null;
  try {
    return {
      header: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')),
      payload: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
      signature,
      input: `${header}.${payload}`
    };
  } catch {
    return null;
  }
}

export function jwtSignatureValid(jwt: NonNullable<ReturnType<typeof decodeJwt>>, publicKey: KeyObject | Record<string, unknown>) {
  try {
    const key = publicKey instanceof KeyObject ? publicKey : createPublicKey({ key: publicKey as webcrypto.JsonWebKey, format: 'jwk' });
    return nodeVerify('sha256', Buffer.from(jwt.input), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(jwt.signature, 'base64url'));
  } catch {
    return false;
  }
}

/** Public key of the first x5c certificate, or null. */
export function x5cPublicKey(header: any): { key: KeyObject; certificate: string } | null {
  const certificate = Array.isArray(header?.x5c) ? header.x5c[0] : undefined;
  if (typeof certificate !== 'string') return null;
  try {
    return { key: new X509Certificate(Buffer.from(certificate, 'base64')).publicKey, certificate };
  } catch {
    return null;
  }
}
