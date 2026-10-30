import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { CredentialFormat, ProtocolLog, WalletType } from '../types/index.js';
import { redactPayload } from '../utils/redactor.js';
import { recordService } from '../utils/metrics.js';
import { TamperOptions, isTampered, prepareCredential } from '../mocks/wallet.js';
import { mdocDocument } from '../mocks/mdoc.js';

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
  /** Extra request headers (logged redacted). */
  headers?: Record<string, string>;
  sender: string;
  receiver: string;
  protocol: ProtocolLog['protocol'];
  action: string;
  tampered?: boolean;
}

export async function liveCall({ method, url, body, contentType, headers: extra = {}, sender, receiver, protocol, action, tampered }: LiveCallOptions) {
  const started = Date.now();
  const headers: Record<string, string> = { ...(contentType ? { 'Content-Type': contentType } : {}), ...extra };
  let response;
  try {
    response = await axios.request({ method, url, data: body, headers, timeout: TIMEOUT_MS, validateStatus: () => true });
  } catch (err: any) {
    recordService(new URL(url).host, Date.now() - started, true);
    throw new CollabUnavailable(`${new URL(url).host} unreachable (${err.code ?? err.message})`);
  }
  recordService(new URL(url).host, Date.now() - started, response.status >= 500);
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
    request: { method, url, headers: redactPayload(headers), ...(body === undefined ? {} : { body: redactPayload(body) }) },
    response: { status: response.status, headers: { 'content-type': responseType }, body: redactPayload(response.data) },
    durationMs: Date.now() - started,
    live: true,
    ...(tampered ? { tampered: true } : {})
  };
  return { status: response.status, data: response.data, headers: response.headers ?? {}, log };
}

const isObject = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const WIRE_FORMATS: Record<CredentialFormat, string[]> = { 'w3c-vc': ['ldp_vc'], 'sd-jwt': ['vc+sd-jwt', 'dc+sd-jwt'], 'mso-mdoc': ['mso_mdoc'] };

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

type Verdict = 'VALID' | 'EXPIRED' | 'INVALID' | 'SIGNATURE_MISMATCH';
const V1_STATUS: Record<string, Verdict> = { SUCCESS: 'VALID', VALID: 'VALID', EXPIRED: 'EXPIRED', INVALID: 'INVALID' };

/** The credential as a string, the way Inji Verify takes it. */
const asSubmitted = (format: CredentialFormat, prepared: any): string =>
  format === 'sd-jwt'
    ? typeof prepared === 'string' ? prepared : prepared?.rawToken
    : format === 'mso-mdoc'
      ? mdocDocument(prepared) ?? ''
      : JSON.stringify(prepared);

/**
 * Inji Verify on the credential as the wallet would present it (really
 * expired, re-typed or with a corrupted signature in tamper mode).
 *
 * Uses POST /v2/vc-verification, which detects the format and reports the
 * schema-and-signature, expiry and status checks separately, plus the claims.
 * Falls back to v1 (/vc-verification, one overall status) where v2 is missing.
 * Both take a credential, not a presentation, so there is no nonce or holder
 * proof to check.
 */
export async function injiVerify(format: CredentialFormat, credential: any, tamper?: TamperOptions, presentationDefinition?: any) {
  const { verify } = collabTargets();
  const tampered = isTampered(tamper);
  const vc = asSubmitted(format, await prepareCredential(format, credential, tamper));
  const common = { sender: 'Wallet', receiver: 'Inji Verify (Collab Sandbox)', protocol: 'OpenID4VP' as const, tampered };

  const v2 = await liveCall({
    ...common,
    method: 'POST',
    url: `${verify}/v1/verify/v2/vc-verification`,
    contentType: 'application/json',
    body: { verifiableCredential: vc, skipStatusChecks: false, includeClaims: true },
    action: 'Verify credential (/v2/vc-verification)'
  });

  let status: Verdict;
  let checks: { formatCheck: boolean; signatureValid: boolean; notExpired: boolean; schemaCompliant: boolean };
  let details: string;
  let claims: Record<string, unknown> | undefined;
  let log = v2.log;

  if (v2.status === 404 || v2.status === 405) {
    const v1 = await liveCall({
      ...common,
      method: 'POST',
      url: `${verify}/v1/verify/vc-verification`,
      contentType: format === 'sd-jwt' ? 'application/vc+sd-jwt' : 'application/vc+ld+json',
      body: format === 'w3c-vc' ? JSON.parse(vc) : vc,
      action: 'Submit credential for verification (/vc-verification)'
    });
    const reported = v1.data.verificationStatus;
    if (v1.status >= 500 || typeof reported !== 'string') {
      throw new CollabUnavailable(`Inji Verify answered HTTP ${v1.status} without a verificationStatus`);
    }
    status = V1_STATUS[reported] ?? 'INVALID';
    // v1 reports one overall status, so the individual checks are inferred.
    checks = { formatCheck: true, signatureValid: status !== 'INVALID', notExpired: status !== 'EXPIRED', schemaCompliant: true };
    details = `Inji Verify (v1) returned verificationStatus "${reported}"; individual checks are inferred from it.`;
    log = v1.log;
  } else {
    const result = v2.data;
    if (v2.status >= 500 || typeof result.allChecksSuccessful !== 'boolean') {
      throw new CollabUnavailable(`Inji Verify answered HTTP ${v2.status} without a verification result`);
    }
    const schemaAndSignature = result.schemaAndSignatureCheck ?? {};
    const error = schemaAndSignature.error;
    const signatureError = /SIGNATURE/i.test(String(error?.errorCode ?? ''));
    const expired = result.expiryCheck?.valid === false;
    const failedStatus = (result.statusCheck ?? []).filter((check: any) => check?.valid === false);
    checks = {
      formatCheck: schemaAndSignature.valid !== false || signatureError,
      signatureValid: !signatureError,
      notExpired: !expired,
      schemaCompliant: failedStatus.length === 0
    };
    status = result.allChecksSuccessful
      ? 'VALID'
      : signatureError
        ? 'SIGNATURE_MISMATCH'
        : schemaAndSignature.valid === false || failedStatus.length
          ? 'INVALID'
          : expired
            ? 'EXPIRED'
            : 'INVALID';
    details = [
      `Inji Verify: schema and signature ${schemaAndSignature.valid ? 'valid' : `invalid${error ? ` (${error.errorCode}: ${error.errorMessage})` : ''}`}`,
      `expiry ${result.expiryCheck ? (expired ? 'failed' : 'valid') : 'not checked'}`,
      `${(result.statusCheck ?? []).length} status check(s)${failedStatus.length ? `, ${failedStatus.length} failed` : ''}.`
    ].join('; ');
    claims = result.claims && typeof result.claims === 'object' ? result.claims : undefined;
  }

  return {
    status,
    // Like the mock verifier: a rejected credential is a failed step even on HTTP 200.
    log: { ...log, status: status === 'VALID' ? 'SUCCESS' : 'FAILED' } as ProtocolLog,
    checks,
    details,
    /** Claims as Inji Verify extracted them (v2), when it returned any. */
    claims: claims && presentationDefinition && Object.keys(claims).length ? claims : undefined
  };
}
