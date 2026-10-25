import { createHash } from 'node:crypto';
import axios from 'axios';
import { collabTargets } from './collab.js';
import { injiLoginProfile, realIssuanceEnabled } from './injiIssuance.js';

/**
 * Which build of each Collab component a run talked to. Collab exposes no
 * version numbers (actuator endpoints answer 403), so this records what can
 * be observed: Inji Verify's API generation and UI build hash, Inji Certify's
 * protocol version and a hash of its metadata, and a hash of Mimoto's issuer
 * registry. A changed fingerprint means a redeployment, which is what
 * regression tracking across Inji releases needs.
 */

const TTL_MS = 10 * 60_000;
const TIMEOUT_MS = 6000;
let cached: { at: number; value: Promise<ComponentFingerprints> } | null = null;

export interface ComponentFingerprints {
  /** One line for run records and filters. */
  label: string;
  injiVerify: { api: string; uiBuild: string };
  injiCertify: { url: string; protocol: string; metadata: string };
  mimoto: { registry: string };
  checkedAt: string;
}

const shortHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 8);

const get = (url: string) => axios.get(url, { timeout: TIMEOUT_MS, validateStatus: () => true });

async function verifyFingerprint(verify: string) {
  const [v2, manifest] = await Promise.all([get(`${verify}/v1/verify/v2/vc-verification`), get(`${verify}/asset-manifest.json`)]);
  // GET on a POST-only endpoint answers 405 when it exists, 404 when it doesn't.
  const api = v2.status === 405 ? 'v2' : v2.status === 404 ? 'v1' : 'unknown';
  const main = String(manifest.data?.files?.['main.js'] ?? '');
  return { api, uiBuild: main.match(/main\.([0-9a-f]+)\.js/)?.[1] ?? 'unknown' };
}

async function certifyFingerprint(certify: string) {
  const metadata = await get(`${certify}/v1/certify/.well-known/openid-credential-issuer`);
  if (metadata.status !== 200 || typeof metadata.data !== 'object') return { url: certify, protocol: 'unknown', metadata: 'unknown' };
  // A Nonce Endpoint in the metadata is the OpenID4VCI 1.0 way of issuing c_nonce.
  return { url: certify, protocol: metadata.data.nonce_endpoint ? 'OpenID4VCI 1.0' : 'OpenID4VCI Draft 13', metadata: shortHash(metadata.data) };
}

async function collect(): Promise<ComponentFingerprints> {
  const { verify, certify, mimoto } = collabTargets();
  const certifyUrl = realIssuanceEnabled() ? injiLoginProfile().certify : certify;
  const [injiVerify, injiCertify, registry] = await Promise.all([
    verifyFingerprint(verify).catch(() => ({ api: 'unreachable', uiBuild: 'unreachable' })),
    certifyFingerprint(certifyUrl).catch(() => ({ url: certifyUrl, protocol: 'unreachable', metadata: 'unreachable' })),
    get(`${mimoto}/v1/mimoto/issuers`)
      .then(res => (res.status === 200 ? shortHash(res.data?.response?.issuers ?? res.data) : 'unknown'))
      .catch(() => 'unreachable')
  ]);
  return {
    label: `Verify ${injiVerify.api}·ui ${injiVerify.uiBuild} | Certify ${injiCertify.protocol.replace('OpenID4VCI ', '')}·${injiCertify.metadata} | Mimoto ${registry}`,
    injiVerify,
    injiCertify,
    mimoto: { registry },
    checkedAt: new Date().toISOString()
  };
}

export function componentFingerprints(): Promise<ComponentFingerprints> {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    const value = collect();
    cached = { at: Date.now(), value };
    value.catch(() => (cached = null));
  }
  return cached.value;
}

/** For tests. */
export const clearComponentCache = () => (cached = null);
