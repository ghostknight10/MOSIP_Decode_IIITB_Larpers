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
 * Resolves bundled contexts and did:key only. URLs inside a presented
 * credential are never fetched, so a credential can't make the BFF call out.
 */
export const documentLoader = async (url: string) => {
  const document = CONTEXTS.get(url);
  if (document) return { contextUrl: null, documentUrl: url, document };
  if (url.startsWith('did:key:')) return { contextUrl: null, documentUrl: url, document: await didKeyDriver.get({ url }) };
  throw new Error(`Unsupported JSON-LD document or verification method: ${url}`);
};

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
            name: `CN=${withCertificate}`,
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
