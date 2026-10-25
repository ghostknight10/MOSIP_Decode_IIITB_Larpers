import { CredentialFormat } from '../types/index.js';
import { decodeJwt, mockKeys, sha256b64url, signJwt, signPresentation } from './crypto.js';
import { MOCK_RESPONSE_URI, MockProtocolService, PresentationRequest, REQUESTED_CLAIMS, claimsOf, disclosuresOf } from './mockService.js';
import { corruptMdoc, presentMdoc } from './mdoc.js';

/**
 * The simulated holder. It presents credentials the way a wallet does: only
 * the requested SD-JWT disclosures, with a proof bound to the verifier's nonce.
 * Tamper options change what is actually sent, so verifiers judge real data.
 */

export interface TamperOptions {
  forceExpired?: boolean;
  corruptSignature?: boolean;
  wrongCredentialType?: boolean;
  replayPresentation?: boolean;
}

export const isTampered = (tamper?: TamperOptions) => Boolean(tamper && Object.values(tamper).some(Boolean));

const corrupt = (signature: string) => `${signature.slice(0, -4)}${signature.endsWith('AAAA') ? 'BBBB' : 'AAAA'}`;
const DAY_S = 86_400;

/**
 * The credential as the holder will present it.
 * - Expired / wrong type: the mock issuer issues that variant, validly signed,
 *   so the verifier must catch it by its checks rather than by a broken
 *   signature. For other issuers' credentials the field is edited in place,
 *   which also breaks their signature.
 * - Corrupt signature: the issuer's signature bytes are altered.
 */
export async function prepareCredential(format: CredentialFormat, credential: any, tamper: TamperOptions = {}) {
  let prepared = credential;
  if (tamper.forceExpired || tamper.wrongCredentialType) {
    if (await MockProtocolService.issuedByMock(format, credential)) {
      prepared = await MockProtocolService.mintCredential(format, claimsOf(format, credential), {
        expired: tamper.forceExpired,
        wrongType: tamper.wrongCredentialType
      });
    } else {
      prepared = editInPlace(format, credential, tamper);
    }
  }
  if (tamper.corruptSignature) prepared = corruptSignature(format, prepared);
  return prepared;
}

function editInPlace(format: CredentialFormat, credential: any, tamper: TamperOptions) {
  // A foreign mDoc's MSO can't be edited without re-signing it; it is presented as is.
  if (format === 'mso-mdoc') return credential;
  if (format === 'sd-jwt') {
    const token: string = typeof credential === 'string' ? credential : credential?.rawToken ?? '';
    const [jwt, ...rest] = token.split('~');
    const decoded = decodeJwt(jwt);
    if (!decoded) return credential;
    const payload = { ...decoded.payload };
    if (tamper.forceExpired) payload.exp = Math.floor(Date.now() / 1000) - DAY_S;
    if (tamper.wrongCredentialType) payload.vct = 'https://example.org/credentials/not-a-national-id';
    const [header] = jwt.split('.');
    const rawToken = [`${header}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${decoded.signature}`, ...rest].join('~');
    return typeof credential === 'string' ? rawToken : { ...credential, rawToken };
  }
  const vc = structuredClone(credential ?? {});
  if (tamper.forceExpired) vc.expirationDate = new Date(Date.now() - DAY_S * 1000).toISOString();
  if (tamper.wrongCredentialType) vc.type = ['VerifiableCredential', 'UnrelatedCredential'];
  return vc;
}

function corruptSignature(format: CredentialFormat, credential: any) {
  if (format === 'mso-mdoc') return corruptMdoc(credential);
  if (format === 'sd-jwt') {
    const token: string = typeof credential === 'string' ? credential : credential?.rawToken ?? '';
    const [jwt, ...rest] = token.split('~');
    const [header, payload, signature = ''] = jwt.split('.');
    const rawToken = [`${header}.${payload}.${corrupt(signature)}`, ...rest].join('~');
    return typeof credential === 'string' ? rawToken : { ...credential, rawToken };
  }
  const vc = structuredClone(credential ?? {});
  for (const key of ['proofValue', 'jws']) {
    if (typeof vc.proof?.[key] === 'string') vc.proof[key] = corrupt(vc.proof[key]);
  }
  return vc;
}

/** The last nonce answered, for the replay attack. */
let previousNonce: string | null = null;

/**
 * Builds the vp_token for a request. A replayed presentation is bound to an
 * earlier request's nonce instead of this one.
 */
export async function present(format: CredentialFormat, credential: any, request: PresentationRequest, tamper: TamperOptions = {}) {
  const prepared = await prepareCredential(format, credential, tamper);
  const nonce = tamper.replayPresentation ? previousNonce ?? `stale-${request.nonce}` : request.nonce;
  previousNonce = request.nonce;

  const wanted = new Set(Object.values(REQUESTED_CLAIMS).flat());
  if (format === 'mso-mdoc') {
    // Only the requested elements, device-signed over a transcript containing the nonce.
    return presentMdoc(prepared, wanted, { client_id: request.client_id, nonce }, MOCK_RESPONSE_URI);
  }
  if (format === 'sd-jwt') {
    const token: string = typeof prepared === 'string' ? prepared : prepared?.rawToken ?? '';
    const [jwt] = token.split('~');
    // Selective disclosure: only the claims the verifier asked for leave the wallet.
    const disclosed = (disclosuresOf(token) ?? []).filter(([, name]) => wanted.has(name)).map(([encoded]) => encoded);
    const presented = `${jwt}~${disclosed.map(d => `${d}~`).join('')}`;
    const { holderEs } = await mockKeys();
    const kbJwt = signJwt(
      { alg: 'ES256', typ: 'kb+jwt' },
      { iat: Math.floor(Date.now() / 1000), aud: request.client_id, nonce, sd_hash: sha256b64url(presented) },
      holderEs.privateKey
    );
    return `${presented}${kbJwt}`;
  }
  return signPresentation(prepared, nonce, request.client_id);
}

/** OpenID4VP with the mock verifier: request, holder presentation, verification. */
export async function presentToMockVerifier(format: CredentialFormat, credential: any, tamper?: TamperOptions) {
  const request = MockProtocolService.createRequest(format);
  const vpToken = await present(format, credential, request, tamper);
  return MockProtocolService.checkPresentation(format, vpToken, request, isTampered(tamper));
}
