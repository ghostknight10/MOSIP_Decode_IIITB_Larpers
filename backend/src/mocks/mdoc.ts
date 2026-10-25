import { createHash, createPublicKey, KeyObject, randomBytes, sign as nodeSign, verify as nodeVerify, X509Certificate } from 'node:crypto';
import { Encoder, Tag } from 'cbor-x';
import { ISSUING_COUNTRY, mockKeys } from './crypto.js';

/**
 * ISO/IEC 18013-5 mDoc (mso_mdoc) for the mock engine (G-2): the issuer signs
 * a Mobile Security Object (COSE_Sign1, ES256, x5chain) holding a digest of
 * every data element; the holder presents a DeviceResponse with only the
 * requested elements and a device signature over a session transcript that
 * binds it to the verifier's nonce (OpenID4VP, ISO 18013-7 style handover,
 * simplified: no mdoc-generated nonce).
 */

export const MDOC_NAMESPACE = 'org.mosip.playground.1';
export const MDOC_DOCTYPE = 'org.mosip.playground.nationalid.1';
const UNRELATED_DOCTYPE = 'org.mosip.playground.unrelated.1';
const DAY_MS = 86_400_000;

const cbor = new Encoder({ useRecords: false, mapsAsObjects: false, tagUint8Array: false });
const encode = (value: unknown) => Buffer.from(cbor.encode(value));
const decode = (bytes: Uint8Array) => cbor.decode(bytes);
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest();
const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');

/** Tag 24: CBOR-encoded data item carried as a byte string. */
const embed = (value: unknown) => new Tag(encode(value), 24);
const unembed = (tagged: any) => decode(tagged instanceof Tag ? (tagged.value as Uint8Array) : tagged);

const ES256_HEADER = encode(new Map([[1, -7]])); // alg: ES256
const X5CHAIN = 33;

function coseSign(payload: Uint8Array, privateKey: KeyObject) {
  const toBeSigned = encode(['Signature1', ES256_HEADER, Buffer.alloc(0), payload]);
  return nodeSign('sha256', toBeSigned, { key: privateKey, dsaEncoding: 'ieee-p1363' });
}

function coseVerify([protectedHeader, , payload, signature]: any[], publicKey: KeyObject, detachedPayload?: Uint8Array) {
  try {
    const toBeSigned = encode(['Signature1', protectedHeader, Buffer.alloc(0), detachedPayload ?? payload]);
    return nodeVerify('sha256', toBeSigned, { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature);
  } catch {
    return false;
  }
}

const coseKeyFromJwk = (jwk: Record<string, string>) =>
  new Map<number, unknown>([
    [1, 2], // kty: EC2
    [-1, 1], // crv: P-256
    [-2, Buffer.from(jwk.x, 'base64url')],
    [-3, Buffer.from(jwk.y, 'base64url')]
  ]);

const publicKeyFromCose = (coseKey: Map<number, any>) =>
  createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: b64url(coseKey.get(-2)), y: b64url(coseKey.get(-3)) },
    format: 'jwk'
  });

const valueOf = (element: unknown) => (element instanceof Tag ? element.value : element instanceof Date ? element.toISOString() : element);

/** An IssuerSigned structure, base64url-encoded, plus a readable summary for the UI. */
export async function mintMdoc(subject: Record<string, unknown>, { expired = false, wrongType = false } = {}) {
  const { issuerEs, holderEs } = await mockKeys();
  // issuing_country must match the C= of the issuer certificate (ISO 18013-5 9.3.1).
  const elements = { ...subject, issuing_country: ISSUING_COUNTRY };
  const items = Object.entries(elements).map(([name, value], digestID) =>
    embed(
      new Map<string, unknown>([
        ['digestID', digestID],
        ['random', randomBytes(16)],
        ['elementIdentifier', name],
        ['elementValue', name === 'dob' ? new Tag(String(value), 1004) : value] // full-date
      ])
    )
  );
  // tdate without fractional seconds (RFC 3339 profile in ISO 18013-5).
  const tdate = (ms: number) => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
  const validFrom = tdate(Date.now() - (expired ? 2 * DAY_MS : 0));
  const validUntil = tdate(expired ? Date.now() - DAY_MS : Date.parse(validFrom) + 365 * DAY_MS);
  const docType = wrongType ? UNRELATED_DOCTYPE : MDOC_DOCTYPE;
  const mso = new Map<string, unknown>([
    ['version', '1.0'],
    ['digestAlgorithm', 'SHA-256'],
    ['valueDigests', new Map([[MDOC_NAMESPACE, new Map(items.map((item, id) => [id, sha256(encode(item))]))]])],
    ['deviceKeyInfo', new Map([['deviceKey', coseKeyFromJwk(holderEs.jwk)]])],
    ['docType', docType],
    [
      'validityInfo',
      new Map([
        ['signed', new Tag(validFrom, 0)],
        ['validFrom', new Tag(validFrom, 0)],
        ['validUntil', new Tag(validUntil, 0)]
      ])
    ]
  ]);
  const payload = encode(embed(mso));
  const issuerAuth = [ES256_HEADER, new Map([[X5CHAIN, Buffer.from(issuerEs.certificate!, 'base64')]]), payload, coseSign(payload, issuerEs.privateKey)];
  const issuerSigned = new Map<string, unknown>([
    ['nameSpaces', new Map([[MDOC_NAMESPACE, items]])],
    ['issuerAuth', issuerAuth]
  ]);
  return {
    format: 'mso_mdoc',
    issuerSigned: b64url(encode(issuerSigned)),
    decoded: {
      docType,
      namespace: MDOC_NAMESPACE,
      claims: subject,
      validFrom,
      validUntil,
      alg: 'ES256'
    }
  };
}

/** The Document form ({ docType, issuerSigned }) that carries the docType, as Inji Verify expects it. */
export function mdocDocument(credential: any): string | undefined {
  const issuerSigned = issuerSignedOf(credential);
  try {
    const structure = decode(Buffer.from(String(issuerSigned), 'base64url'));
    const mso = unembed(decode(structure.get('issuerAuth')[2])) as Map<string, any>;
    return b64url(encode(new Map<string, unknown>([['docType', mso.get('docType')], ['issuerSigned', structure]])));
  } catch {
    return issuerSigned;
  }
}

export const issuerSignedOf = (credential: any): string | undefined =>
  typeof credential === 'string' ? credential : credential?.issuerSigned;

interface ParsedIssuerSigned {
  items: any[];
  issuerAuth: any[];
  mso: Map<string, any>;
}

function parseIssuerSigned(issuerSigned: unknown): ParsedIssuerSigned | null {
  try {
    const structure = decode(Buffer.from(String(issuerSigned), 'base64url')) as Map<string, any>;
    const issuerAuth = structure.get('issuerAuth');
    const items = structure.get('nameSpaces')?.get(MDOC_NAMESPACE) ?? [];
    const mso = unembed(decode(issuerAuth[2])) as Map<string, any>;
    return { items, issuerAuth, mso };
  } catch {
    return null;
  }
}

const itemFields = (item: any) => unembed(item) as Map<string, any>;

/** Claims carried by an mDoc credential. */
export function mdocClaims(credential: any): Record<string, unknown> {
  const parsed = parseIssuerSigned(issuerSignedOf(credential));
  if (!parsed) return {};
  return Object.fromEntries(parsed.items.map(item => itemFields(item)).map(fields => [fields.get('elementIdentifier'), valueOf(fields.get('elementValue'))]));
}

/** True when the mock issuer's certificate signed this mDoc. */
export async function mdocIssuedByMock(credential: any) {
  const parsed = parseIssuerSigned(issuerSignedOf(credential));
  const certificate = parsed?.issuerAuth?.[1]?.get?.(X5CHAIN);
  const { issuerEs } = await mockKeys();
  return Boolean(certificate) && Buffer.from(certificate).toString('base64') === issuerEs.certificate;
}

/** Alters the issuer signature bytes, keeping everything else. */
export function corruptMdoc(credential: any) {
  const issuerSigned = issuerSignedOf(credential);
  try {
    const structure = decode(Buffer.from(String(issuerSigned), 'base64url')) as Map<string, any>;
    const issuerAuth = structure.get('issuerAuth');
    const signature = Buffer.from(issuerAuth[3]);
    signature[signature.length - 1] ^= 0xff;
    issuerAuth[3] = signature;
    const corrupted = b64url(encode(structure));
    return typeof credential === 'string' ? corrupted : { ...credential, issuerSigned: corrupted };
  } catch {
    return credential;
  }
}

const sessionTranscript = (clientId: string, responseUri: string, nonce: string) => [
  null,
  null,
  [sha256(encode(clientId)), sha256(encode(responseUri)), nonce]
];

const deviceAuthenticationBytes = (transcript: unknown, docType: string) =>
  encode(embed(['DeviceAuthentication', transcript, docType, embed(new Map())]));

/** DeviceResponse with the wanted elements only, device-signed for this request. */
export async function presentMdoc(credential: any, wanted: Set<string>, request: { client_id: string; nonce: string }, responseUri: string) {
  const parsed = parseIssuerSigned(issuerSignedOf(credential));
  if (!parsed) return issuerSignedOf(credential) ?? '';
  const { holderEs } = await mockKeys();
  const docType = parsed.mso.get('docType');
  const transcript = sessionTranscript(request.client_id, responseUri, request.nonce);
  const signature = coseSign(deviceAuthenticationBytes(transcript, docType), holderEs.privateKey);
  const document = new Map<string, unknown>([
    ['docType', docType],
    [
      'issuerSigned',
      new Map<string, unknown>([
        ['nameSpaces', new Map([[MDOC_NAMESPACE, parsed.items.filter(item => wanted.has(itemFields(item).get('elementIdentifier')))]])],
        ['issuerAuth', parsed.issuerAuth]
      ])
    ],
    [
      'deviceSigned',
      new Map<string, unknown>([
        ['nameSpaces', embed(new Map())],
        ['deviceAuth', new Map([['deviceSignature', [ES256_HEADER, new Map(), null, signature]]])]
      ])
    ]
  ]);
  return b64url(encode(new Map<string, unknown>([['version', '1.0'], ['documents', [document]], ['status', 0]])));
}

export type MdocProblem = { check: 'formatCheck' | 'signatureValid' | 'notExpired' | 'schemaCompliant' | 'holderBinding'; message: string };

/** Verifies a DeviceResponse for a request: issuer signature and trust, digests, device binding, validity, docType. */
export async function checkMdocPresentation(
  vpToken: unknown,
  request: { client_id: string; nonce: string },
  responseUri: string
): Promise<{ problem?: MdocProblem; claims: Record<string, unknown> }> {
  const fail = (check: MdocProblem['check'], message: string) => ({ problem: { check, message }, claims: {} });
  let document: Map<string, any>;
  let mso: Map<string, any>;
  let issuerAuth: any[];
  let items: any[];
  try {
    const response = decode(Buffer.from(String(vpToken), 'base64url')) as Map<string, any>;
    document = response.get('documents')[0];
    issuerAuth = document.get('issuerSigned').get('issuerAuth');
    items = document.get('issuerSigned').get('nameSpaces')?.get(MDOC_NAMESPACE) ?? [];
    mso = unembed(decode(issuerAuth[2])) as Map<string, any>;
  } catch {
    return fail('formatCheck', 'Expected a CBOR DeviceResponse (ISO 18013-5) with one document.');
  }

  const certificate = issuerAuth[1]?.get?.(X5CHAIN);
  let issuerKey: KeyObject;
  try {
    issuerKey = new X509Certificate(Buffer.from(certificate)).publicKey;
  } catch {
    return fail('signatureValid', 'The issuerAuth has no usable x5chain certificate.');
  }
  if (!coseVerify(issuerAuth, issuerKey)) return fail('signatureValid', 'The issuer signature (issuerAuth) does not verify against its certificate.');
  const { issuerEs } = await mockKeys();
  if (Buffer.from(certificate).toString('base64') !== issuerEs.certificate) {
    return fail('signatureValid', "The issuer certificate is not in the verifier's trust list.");
  }

  const digests: Map<number, Uint8Array> = mso.get('valueDigests')?.get(MDOC_NAMESPACE) ?? new Map();
  for (const item of items) {
    const fields = itemFields(item);
    const expected = digests.get(fields.get('digestID'));
    if (!expected || !Buffer.from(expected).equals(sha256(encode(item)))) {
      return fail('signatureValid', `Element "${fields.get('elementIdentifier')}" does not match its digest in the MSO.`);
    }
  }

  const deviceSignature = document.get('deviceSigned')?.get('deviceAuth')?.get('deviceSignature');
  const transcript = sessionTranscript(request.client_id, responseUri, request.nonce);
  const deviceKey = mso.get('deviceKeyInfo')?.get('deviceKey');
  const bound =
    deviceSignature &&
    deviceKey &&
    coseVerify(deviceSignature, publicKeyFromCose(deviceKey), deviceAuthenticationBytes(transcript, document.get('docType')));
  if (!bound) {
    return fail('holderBinding', 'The device signature does not cover this request (wrong device key, or a replayed presentation for another nonce).');
  }

  const validUntil = valueOf(mso.get('validityInfo')?.get('validUntil'));
  if (validUntil && new Date(String(validUntil)).getTime() < Date.now()) return fail('notExpired', `mDoc expired on ${validUntil}.`);
  if (mso.get('docType') !== MDOC_DOCTYPE || document.get('docType') !== MDOC_DOCTYPE) {
    return fail('schemaCompliant', `docType ${mso.get('docType')} is not ${MDOC_DOCTYPE}.`);
  }
  return {
    claims: Object.fromEntries(items.map(item => itemFields(item)).map(fields => [fields.get('elementIdentifier'), valueOf(fields.get('elementValue'))]))
  };
}
