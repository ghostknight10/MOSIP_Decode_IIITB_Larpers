import { createHash, randomBytes } from 'node:crypto';
import { ProtocolLog } from '../types/index.js';
import { mockKeys, signJwt } from '../mocks/crypto.js';
import { CollabUnavailable, liveCall } from './collab.js';

/**
 * Real issuance from Inji Certify on the Collab sandbox (E-1): the wallet logs
 * in to eSignet as a Collab test identity (OTP), exchanges the code through
 * Mimoto's token proxy (which holds the client key), and asks Certify for a
 * credential with a proof of possession of the wallet's key.
 *
 * Enabled by COLLAB_TEST_INDIVIDUAL_ID. The Collab Certify behind this login is
 * the Land Registry instance; its data table has records for MOSIP's published
 * test identities (e.g. 8267411578), which a newly created identity lacks.
 * Certify speaks OpenID4VCI 1.0 here: credential_configuration_id, proofs, and
 * a c_nonce from its own Nonce Endpoint (G-11).
 */

const env = (name: string, fallback: string) => process.env[name] || fallback;

/** Read at call time: index.ts loads .env after its imports have run. */
export const injiLoginProfile = () => ({
  individualId: process.env.COLLAB_TEST_INDIVIDUAL_ID ?? '',
  otp: env('COLLAB_TEST_OTP', '111111'),
  esignet: env('COLLAB_ESIGNET_URL', 'https://esignet-mock.collab.mosip.net'),
  certify: env('COLLAB_LOGIN_CERTIFY_URL', 'https://injicertify-landregistry.collab.mosip.net'),
  mimoto: env('MOSIP_INJI_MIMOTO_URL', 'https://api.collab.mosip.net'),
  mimotoIssuerId: env('COLLAB_MIMOTO_ISSUER_ID', 'Land'),
  clientId: env('COLLAB_CLIENT_ID', 'mpartner-default-mimoto-land-oidc'),
  redirectUri: env('COLLAB_REDIRECT_URI', 'io.mosip.residentapp.inji://oauthredirect'),
  scope: env('COLLAB_SCOPE', 'land_statement_vc_ldp'),
  configurationId: env('COLLAB_CREDENTIAL_CONFIGURATION_ID', 'LandStatementCredential')
});

export const realIssuanceEnabled = () => Boolean(injiLoginProfile().individualId);

const b64url = (bytes: Buffer) => bytes.toString('base64url');
const requestTime = () => new Date().toISOString().replace(/\.\d+Z$/, '.000Z');

/** Thrown when a Collab step answers but refuses; the message says which step. */
export class InjiIssuanceRefused extends Error {}

/** Collects the cookies eSignet sets (XSRF-TOKEN), for the following calls. */
class CookieJar {
  private cookies = new Map<string, string>();
  take(headers: Record<string, unknown>) {
    const setCookie = headers['set-cookie'];
    for (const cookie of Array.isArray(setCookie) ? setCookie : setCookie ? [String(setCookie)] : []) {
      const [pair] = cookie.split(';');
      const i = pair.indexOf('=');
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1));
    }
  }
  get(name: string) {
    return this.cookies.get(name);
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

export async function issueFromInjiCertify(emit: (log: ProtocolLog) => void) {
  const p = injiLoginProfile();
  const jar = new CookieJar();
  const wallet = 'Inji Wallet';
  const esignet = 'eSignet (Inji Certify authorization server)';
  const step = async (options: Parameters<typeof liveCall>[0]) => {
    const result = await liveCall(options);
    emit(result.log);
    jar.take(result.headers as Record<string, unknown>);
    return result;
  };
  const esignetHeaders = (extra: Record<string, string> = {}) => ({
    Cookie: jar.header(),
    'X-XSRF-TOKEN': jar.get('XSRF-TOKEN') ?? '',
    ...extra
  });
  const ok = (result: { status: number; data: any }, what: string) => {
    const error = result.data?.errors?.[0]?.errorCode ?? result.data?.error;
    if (result.status >= 400 || error) throw new InjiIssuanceRefused(`${what} refused: ${error ?? `HTTP ${result.status}`}`);
    return result.data;
  };

  // 1. eSignet authorization (PKCE), as Mimoto's OIDC client.
  const verifier = b64url(randomBytes(32));
  const csrf = await liveCall({ method: 'GET', url: `${p.esignet}/v1/esignet/csrf/token`, sender: wallet, receiver: esignet, protocol: 'OpenID4VCI', action: 'eSignet CSRF token' });
  jar.take(csrf.headers as Record<string, unknown>);
  if (!jar.get('XSRF-TOKEN')) throw new CollabUnavailable('eSignet did not set an XSRF-TOKEN cookie');

  const details = ok(
    await step({
      method: 'POST',
      url: `${p.esignet}/v1/esignet/authorization/v2/oauth-details`,
      contentType: 'application/json',
      headers: esignetHeaders(),
      body: {
        requestTime: requestTime(),
        request: {
          clientId: p.clientId,
          scope: p.scope,
          responseType: 'code',
          redirectUri: p.redirectUri,
          display: 'popup',
          prompt: 'login',
          acrValues: 'mosip:idp:acr:generated-code',
          nonce: b64url(randomBytes(12)),
          state: b64url(randomBytes(12)),
          claimsLocales: 'en',
          codeChallenge: b64url(createHash('sha256').update(verifier).digest()),
          codeChallengeMethod: 'S256'
        }
      },
      sender: wallet,
      receiver: esignet,
      protocol: 'OpenID4VCI',
      action: 'Authorization request (eSignet oauth-details)'
    }),
    'eSignet authorization request'
  );
  const transactionId: string = details.response.transactionId;
  // eSignet binds later calls to the authorization details it returned.
  const bound = esignetHeaders({
    'oauth-details-key': transactionId,
    'oauth-details-hash': b64url(createHash('sha256').update(JSON.stringify(details.response)).digest())
  });

  // 2. Citizen login with OTP (the Collab mock identity system's test OTP).
  ok(
    await step({
      method: 'POST',
      url: `${p.esignet}/v1/esignet/authorization/send-otp`,
      contentType: 'application/json',
      headers: bound,
      body: { requestTime: requestTime(), request: { transactionId, individualId: p.individualId, otpChannels: ['email', 'phone'], captchaToken: '' } },
      sender: wallet,
      receiver: esignet,
      protocol: 'OpenID4VCI',
      action: 'Send OTP to the test identity'
    }),
    'eSignet send-otp'
  );
  ok(
    await step({
      method: 'POST',
      url: `${p.esignet}/v1/esignet/authorization/v3/authenticate`,
      contentType: 'application/json',
      headers: bound,
      body: {
        requestTime: requestTime(),
        request: { transactionId, individualId: p.individualId, challengeList: [{ authFactorType: 'OTP', challenge: p.otp, format: 'alpha-numeric' }] }
      },
      sender: wallet,
      receiver: esignet,
      protocol: 'OpenID4VCI',
      action: 'Authenticate with OTP'
    }),
    'eSignet authentication'
  );
  const code: string = ok(
    await step({
      method: 'POST',
      url: `${p.esignet}/v1/esignet/authorization/auth-code`,
      contentType: 'application/json',
      headers: bound,
      body: { requestTime: requestTime(), request: { transactionId, acceptedClaims: [], permittedAuthorizeScopes: [] } },
      sender: wallet,
      receiver: esignet,
      protocol: 'OpenID4VCI',
      action: 'Authorization code'
    }),
    'eSignet auth-code'
  ).response.code;

  // 3. Token through Mimoto, which signs the client assertion for the wallet.
  const token = ok(
    await step({
      method: 'POST',
      url: `${p.mimoto}/v1/mimoto/get-token/${encodeURIComponent(p.mimotoIssuerId)}`,
      contentType: 'application/x-www-form-urlencoded',
      body: { grant_type: 'authorization_code', code, redirect_uri: p.redirectUri, code_verifier: verifier, client_id: p.clientId },
      sender: wallet,
      receiver: 'Mimoto (Inji wallet backend)',
      protocol: 'OpenID4VCI',
      action: 'Token request (via Mimoto)'
    }),
    'Mimoto token request'
  );

  // 4. Nonce from Certify's Nonce Endpoint (OpenID4VCI 1.0), then the credential.
  const nonce = ok(
    await step({ method: 'POST', url: `${p.certify}/v1/certify/nonce`, sender: wallet, receiver: 'Inji Certify (Collab Sandbox)', protocol: 'OpenID4VCI', action: 'Nonce request' }),
    'Certify nonce request'
  ).c_nonce;
  const { holderEs } = await mockKeys();
  const proof = signJwt(
    { alg: 'ES256', typ: 'openid4vci-proof+jwt', jwk: holderEs.jwk },
    { iss: p.clientId, aud: p.certify, iat: Math.floor(Date.now() / 1000), nonce },
    holderEs.privateKey
  );
  const issued = ok(
    await step({
      method: 'POST',
      url: `${p.certify}/v1/certify/issuance/credential`,
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${token.access_token}` },
      body: { credential_configuration_id: p.configurationId, proofs: { jwt: [proof] } },
      sender: wallet,
      receiver: 'Inji Certify (Collab Sandbox)',
      protocol: 'OpenID4VCI',
      action: 'Credential request (/credential)'
    }),
    'Certify credential request'
  );
  const credential = issued.credentials?.[0]?.credential ?? issued.credential;
  if (!credential?.proof) throw new InjiIssuanceRefused('Certify answered without a credential');

  return {
    credential,
    credentialOffer: {
      credential_issuer: p.certify,
      credential_configuration_ids: [p.configurationId],
      grants: { authorization_code: { authorization_server: p.esignet } }
    },
    notice: `Real credential: Inji Certify (${new URL(p.certify).host}) issued a ${p.configurationId} after an eSignet OTP login as the Collab test identity ${p.individualId.slice(0, 3)}…${p.individualId.slice(-2)}.`
  };
}
