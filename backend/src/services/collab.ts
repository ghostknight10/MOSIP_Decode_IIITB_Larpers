import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { CredentialFormat, ProtocolLog, WalletType } from '../types/index.js';
import { redactPayload } from '../utils/redactor.js';
import { TamperOptions, isTampered, prepareCredential } from '../mocks/wallet.js';

/**
 * Live calls to the MOSIP Collab sandbox. Every exchange is recorded as a
 * ProtocolLog with the real request and (redacted) response, so the inspector
 * shows actual Inji traffic rather than mock frames.
 */

/** Read at call time: index.ts loads .env after its imports have run. */
export const collabTargets = () => ({
  certify: process.env.MOSIP_INJI_CERTIFY_URL || 'https://injicertify-mosipid.collab.mosip.net',
  verify: process.env.MOSIP_INJI_VERIFY_URL || 'https://injiverify.collab.mosip.net',
  mimoto: process.env.MOSIP_INJI_MIMOTO_URL || 'https://api.collab.mosip.net'
});

const TIMEOUT_MS = 8000;

/** The service could not be reached or did not answer with JSON: fall back to the mock engine. */
export class CollabUnavailable extends Error {}

interface LiveCallOptions {
  method: 'GET' | 'POST';
  url: string;
  body?: unknown;
  contentType?: string;
  sender: string;
  receiver: string;
  protocol: ProtocolLog['protocol'];
  action: string;
  tampered?: boolean;
}

export async function liveCall({ method, url, body, contentType, sender, receiver, protocol, action, tampered }: LiveCallOptions) {
  const started = Date.now();
  const headers: Record<string, string> = contentType ? { 'Content-Type': contentType } : {};
  let response;
  try {
    response = await axios.request({ method, url, data: body, headers, timeout: TIMEOUT_MS, validateStatus: () => true });
  } catch (err: any) {
    throw new CollabUnavailable(`${new URL(url).host} unreachable (${err.code ?? err.message})`);
  }
  const responseType = String(response.headers?.['content-type'] ?? '');
  if (!responseType.includes('json') || typeof response.data !== 'object' || response.data === null) {
    throw new CollabUnavailable(`${new URL(url).host} answered HTTP ${response.status} without JSON`);
  }
  const log: ProtocolLog = {
    id: uuidv4(),
    timestamp: new Date(started).toISOString(),
    step: 0, // numbered by the route when the transaction is recorded
    sender,
    receiver,
    protocol,
    action,
    status: response.status < 400 ? 'SUCCESS' : 'FAILED',
    request: { method, url, headers, ...(body === undefined ? {} : { body: redactPayload(body) }) },
    response: { status: response.status, headers: { 'content-type': responseType }, body: redactPayload(response.data) },
    durationMs: Date.now() - started,
    live: true,
    ...(tampered ? { tampered: true } : {})
  };
  return { status: response.status, data: response.data, log };
}

const isObject = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const WIRE_FORMATS: Record<CredentialFormat, string[]> = { 'w3c-vc': ['ldp_vc'], 'sd-jwt': ['vc+sd-jwt', 'dc+sd-jwt'] };

/**
 * OpenID4VCI against Inji Certify, as far as it goes without a user login:
 * issuer metadata, the Mimoto issuer registry (Inji wallet), and the credential
 * request, which Certify refuses without an eSignet access token. The caller
 * emulates the credential itself.
 */
export async function certifyDiscovery(
  format: CredentialFormat,
  wallet: WalletType | undefined,
  /** Called as each live call completes, so the audit stream shows it immediately. */
  emit: (log: ProtocolLog) => void
) {
  const { certify, mimoto } = collabTargets();

  const metadataCall = await liveCall({
    method: 'GET',
    url: `${certify}/v1/certify/.well-known/openid-credential-issuer`,
    sender: 'Wallet',
    receiver: 'Inji Certify (Collab Sandbox)',
    protocol: 'OpenID4VCI',
    action: 'Fetch issuer metadata'
  });
  emit(metadataCall.log);
  const metadata = metadataCall.data;
  if (metadataCall.status !== 200 || !isObject(metadata.credential_configurations_supported)) {
    throw new CollabUnavailable(`Inji Certify metadata unavailable (HTTP ${metadataCall.status})`);
  }

  if (wallet === 'inji-wallet') {
    const registry = await liveCall({
      method: 'GET',
      url: `${mimoto}/v1/mimoto/issuers`,
      sender: 'Inji Wallet',
      receiver: 'Mimoto (Inji wallet backend)',
      protocol: 'OpenID4VCI',
      action: 'Look up issuer in Mimoto registry'
    }).catch(() => null); // the registry is informative; issuance doesn't depend on it
    if (registry) emit(registry.log);
  }

  const configs = metadata.credential_configurations_supported as Record<string, any>;
  const [configId, config] = Object.entries(configs).find(([, c]) => WIRE_FORMATS[format].includes(c?.format)) ?? [];
  const reasons: string[] = [];

  // Only call the credential endpoint on the issuer's own origin: the URL comes
  // from remote metadata and must not turn the BFF into a request relay.
  const endpoint = typeof metadata.credential_endpoint === 'string' ? metadata.credential_endpoint : '';
  const sameOrigin = (() => {
    try {
      return new URL(endpoint).origin === new URL(certify).origin;
    } catch {
      return false;
    }
  })();

  if (!configId) {
    reasons.push(`it offers no ${WIRE_FORMATS[format][0]} credential (only ${Object.keys(configs).join(', ') || 'none'})`);
  } else if (sameOrigin) {
    const credentialCall = await liveCall({
      method: 'POST',
      url: endpoint,
      contentType: 'application/json',
      body: { format: config.format, credential_definition: { type: config.credential_definition?.type } },
      sender: 'Wallet',
      receiver: 'Inji Certify (Collab Sandbox)',
      protocol: 'OpenID4VCI',
      action: 'Credential request (no access token)'
    });
    emit(credentialCall.log);
    reasons.push(`its credential endpoint needs an eSignet access token (HTTP ${credentialCall.status})`);
  } else {
    reasons.push('its credential_endpoint is on another origin, so it was not called');
  }

  return {
    credentialOffer: {
      credential_issuer: metadata.credential_issuer ?? certify,
      credential_configuration_ids: configId ? [configId] : [],
      grants: { authorization_code: { authorization_server: metadata.authorization_servers?.[0] } }
    },
    notice: `Inji Certify answered live, but ${reasons.join('; ')}. The credential itself is emulated.`
  };
}

const STATUS: Record<string, 'VALID' | 'EXPIRED' | 'INVALID'> = { SUCCESS: 'VALID', VALID: 'VALID', EXPIRED: 'EXPIRED', INVALID: 'INVALID' };

/**
 * Inji Verify's /vc-verification on the credential as the wallet would present
 * it (really expired, re-typed or with a corrupted signature in tamper mode).
 * This endpoint takes a credential, not a presentation, so there is no nonce
 * or holder proof to check.
 */
export async function injiVerify(format: CredentialFormat, credential: any, tamper?: TamperOptions) {
  const { verify } = collabTargets();
  const tampered = isTampered(tamper);
  const prepared = await prepareCredential(format, credential, tamper);
  const presented = format === 'sd-jwt' && typeof prepared !== 'string' ? prepared?.rawToken : prepared;

  const call = await liveCall({
    method: 'POST',
    url: `${verify}/v1/verify/vc-verification`,
    contentType: format === 'sd-jwt' ? 'application/vc+sd-jwt' : 'application/vc+ld+json',
    body: presented,
    sender: 'Wallet',
    receiver: 'Inji Verify (Collab Sandbox)',
    protocol: 'OpenID4VP',
    action: 'Submit credential for verification (/vc-verification)',
    tampered
  });
  const reported = call.data.verificationStatus;
  if (call.status >= 500 || typeof reported !== 'string') {
    throw new CollabUnavailable(`Inji Verify answered HTTP ${call.status} without a verificationStatus`);
  }
  const status = STATUS[reported] ?? 'INVALID';
  return {
    status,
    reported,
    // Like the mock verifier: a rejected credential is a failed step even on HTTP 200.
    log: { ...call.log, status: status === 'VALID' ? 'SUCCESS' : 'FAILED' } as ProtocolLog,
    // Inji Verify reports one overall status, not individual checks.
    checks: {
      formatCheck: true,
      signatureValid: status !== 'INVALID',
      notExpired: status !== 'EXPIRED',
      schemaCompliant: true
    },
    details: `Inji Verify returned verificationStatus "${reported}". It reports one overall result, so the individual checks are inferred from it.`
  };
}
