import { ProtocolLog } from '../types/index.js';
import { mockKeys, signJwt, decodeJwt } from '../mocks/crypto.js';
import { REQUESTED_CLAIMS, NATIONAL_ID_VCT, disclosuresOf } from '../mocks/mockService.js';
import { TamperOptions, isTampered, prepareCredential } from '../mocks/wallet.js';
import { CollabUnavailable, liveCall } from './collab.js';

/**
 * Walt.id as an independent, standards-based OpenID4VC implementation: a
 * non-MOSIP issuer (OpenID4VCI Draft 13) and a non-MOSIP verifier (OpenID4VP).
 * The playground's wallet talks to their public demo services, which proves
 * cross-ecosystem interoperability instead of only Inji-to-Inji.
 *
 * The issuer key below is the demo key published in Walt.id's own API
 * documentation for the public demo issuer; it is not a secret.
 */

/** Read at call time, so .env applies. */
export const waltTargets = () => ({
  issuer: process.env.WALT_ISSUER_URL || 'https://issuer.portal.walt.id',
  verifier: process.env.WALT_VERIFIER_URL || 'https://verifier.portal.walt.id'
});

const DEMO_ISSUER_KEY = {
  type: 'jwk',
  jwk: {
    kty: 'OKP',
    d: 'mDhpwaH6JYSrD2Bq7Cs-pzmsjlLj4EOhxyI-9DM1mFI',
    crv: 'Ed25519',
    kid: 'Vzx7l5fh56F3Pf9aR3DECU5BwfrY6ZJe05aiWYWzan8',
    x: 'T3T4-u1Xz3vAV2JwPNxWfs4pik_JLiArz_WTCvrCFUM'
  }
};
// The did:key derived from the key's public part. (The DID printed next to this key in
// Walt.id's API docs belongs to a different key, so credentials signed under it can't verify.)
export const WALT_DEMO_ISSUER_DID = 'did:key:z6MkjoRhq1jSNJdLiruSXrFFxagqrztZaXHqHGUTKJbcNywp';
export const WALT_CONFIGURATION = 'VerifiableId_vc+sd-jwt';
const PRE_AUTHORIZED = 'urn:ietf:params:oauth:grant-type:pre-authorized_code';

const WALT_ISSUER_LABEL = 'Walt.id Issuer';
const WALT_VERIFIER_LABEL = 'Walt.id Verifier';

/** Refused by Walt.id: it answered, but said no. */
export class WaltRefused extends Error {}

const failed = (result: { status: number; data: any }, what: string) => {
  if (result.status >= 400) {
    const message = typeof result.data === 'object' ? result.data?.message ?? result.data?.error : String(result.data).slice(0, 160);
    throw new WaltRefused(`${what} refused: ${String(message ?? `HTTP ${result.status}`).slice(0, 220)}`);
  }
  return result.data;
};

/**
 * OpenID4VCI Draft 13, pre-authorized code: the wallet obtains an SD-JWT VC
 * from Walt.id's issuer. Every call is a live log.
 */
export async function issueFromWalt(subject: Record<string, string>, emit: (log: ProtocolLog) => void) {
  const { issuer } = waltTargets();
  const wallet = 'Wallet';
  const issuerName = WALT_ISSUER_LABEL;
  const step = async (options: Parameters<typeof liveCall>[0]) => {
    const result = await liveCall(options);
    emit(result.log);
    return result;
  };

  // 1. Issuer side: ask Walt.id to prepare an offer for these claims, all selectively disclosable.
  const claims = Object.fromEntries(Object.keys(subject).map(name => [name, { sd: true }]));
  const create = await step({
    method: 'POST',
    url: `${issuer}/openid4vc/sdjwt/issue`,
    contentType: 'application/json',
    anyBody: true,
    body: {
      issuerKey: DEMO_ISSUER_KEY,
      issuerDid: WALT_DEMO_ISSUER_DID,
      credentialConfigurationId: WALT_CONFIGURATION,
      credentialData: { '@context': ['https://www.w3.org/2018/credentials/v1'], type: ['VerifiableCredential', 'VerifiableId'], credentialSubject: subject },
      selectiveDisclosure: { fields: { credentialSubject: { sd: false, children: { fields: claims } } } },
      authenticationMethod: 'PRE_AUTHORIZED'
    },
    sender: 'Issuer (OpenID4VCI)',
    receiver: issuerName,
    protocol: 'OpenID4VCI',
    action: 'Create credential offer (issuer API)'
  });
  const offerUrl = String(failed(create, 'Credential offer'));
  if (!offerUrl.startsWith('openid-credential-offer://')) throw new WaltRefused('Walt.id did not return a credential offer');
  const offerRef = new URL(offerUrl).searchParams.get('credential_offer_uri');
  const inlineOffer = new URL(offerUrl).searchParams.get('credential_offer');

  // 2. Wallet side: fetch the offer, metadata, token, credential.
  const offer: any = inlineOffer
    ? JSON.parse(inlineOffer)
    : failed(await step({ method: 'GET', url: offerRef!, sender: wallet, receiver: issuerName, protocol: 'OpenID4VCI', action: 'Fetch Credential Offer' }), 'Offer fetch');
  const base: string = offer.credential_issuer;
  const metadata: any = failed(
    await step({ method: 'GET', url: `${base}/.well-known/openid-credential-issuer`, sender: wallet, receiver: issuerName, protocol: 'OpenID4VCI', action: 'Fetch issuer metadata' }),
    'Issuer metadata'
  );
  const preAuthorized = offer.grants?.[PRE_AUTHORIZED]?.['pre-authorized_code'];
  if (!preAuthorized) throw new WaltRefused('The offer has no pre-authorized code');
  const token: any = failed(
    await step({
      method: 'POST',
      url: metadata.token_endpoint,
      contentType: 'application/x-www-form-urlencoded',
      body: { grant_type: PRE_AUTHORIZED, 'pre-authorized_code': preAuthorized },
      sender: wallet,
      receiver: issuerName,
      protocol: 'OpenID4VCI',
      action: 'Token request (pre-authorized code)'
    }),
    'Token request'
  );
  const { holderEs } = await mockKeys();
  const proof = signJwt(
    { alg: 'ES256', typ: 'openid4vci-proof+jwt', jwk: holderEs.jwk },
    { iss: 'mosip-playground-wallet', aud: base, iat: Math.floor(Date.now() / 1000), nonce: token.c_nonce },
    holderEs.privateKey
  );
  const configuration = offer.credential_configuration_ids?.[0] ?? WALT_CONFIGURATION;
  const issued: any = failed(
    await step({
      method: 'POST',
      url: metadata.credential_endpoint,
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${token.access_token}` },
      // Draft 13 request: format and vct, with a JWT proof of possession.
      body: { format: 'vc+sd-jwt', vct: metadata.credential_configurations_supported?.[configuration]?.vct, proof: { proof_type: 'jwt', jwt: proof } },
      sender: wallet,
      receiver: issuerName,
      protocol: 'OpenID4VCI',
      action: 'Credential Request (/credential)'
    }),
    'Credential request'
  );
  const rawToken: unknown = issued.credential ?? issued.credentials?.[0]?.credential;
  if (typeof rawToken !== 'string' || !rawToken.includes('~')) throw new WaltRefused('Walt.id answered without an SD-JWT credential');

  const jwt = decodeJwt(rawToken.split('~')[0]);
  const credential = {
    format: 'vc+sd-jwt',
    rawToken,
    decoded: {
      header: { alg: jwt?.header.alg, typ: jwt?.header.typ, kid: jwt?.header.kid },
      payload: { iss: jwt?.payload.iss, vct: jwt?.payload.vct, exp: jwt?.payload.exp, claims: Object.fromEntries((disclosuresOf(rawToken) ?? []).map(([, name, value]) => [name, value])) }
    }
  };
  return {
    credential,
    credentialOffer: offer,
    proofType: `JWT (${jwt?.header.alg ?? 'unknown'})`,
    notice: `Real credential from an independent issuer: ${new URL(base).host} issued a ${configuration} over OpenID4VCI Draft 13 (pre-authorized code).`
  };
}

const VERDICT_BY_POLICY: Record<string, 'SIGNATURE_MISMATCH' | 'EXPIRED' | 'INVALID'> = { signature: 'SIGNATURE_MISMATCH', expired: 'EXPIRED', 'not-before': 'EXPIRED' };

/**
 * OpenID4VP against Walt.id's verifier: it opens a session, the wallet fetches
 * the presentation definition and answers at the response_uri with only the
 * requested claims. Walt.id (1.2.0) cannot parse a key-binding JWT, so the SD-JWT
 * is presented without one, which also means it has no replay protection (G-15).
 */
export async function presentToWalt(credential: any, tamper: TamperOptions | undefined, emit: (log: ProtocolLog) => void) {
  const { verifier } = waltTargets();
  const wallet = 'Wallet';
  const verifierName = WALT_VERIFIER_LABEL;
  const tampered = isTampered(tamper);
  const step = async (options: Parameters<typeof liveCall>[0]) => {
    const result = await liveCall({ ...options, tampered: options.tampered ?? false });
    emit(result.log);
    return result;
  };

  const create = await step({
    method: 'POST',
    url: `${verifier}/openid4vc/verify`,
    contentType: 'application/json',
    headers: { authorizeBaseUrl: 'openid4vp://authorize', responseMode: 'direct_post' },
    anyBody: true,
    body: {
      request_credentials: [{ type: NATIONAL_ID_VCT, format: 'vc+sd-jwt' }],
      vp_policies: ['signature'],
      vc_policies: ['signature', 'expired', 'not-before']
    },
    sender: 'Verifier (OpenID4VP)',
    receiver: verifierName,
    protocol: 'OpenID4VP',
    action: 'Authorization Request (verifier API)'
  });
  const requestUrl = String(failed(create, 'Authorization request'));
  if (!requestUrl.startsWith('openid4vp://')) throw new WaltRefused('Walt.id did not return an authorization request');
  const params = Object.fromEntries(new URL(requestUrl).searchParams);
  const definition: any = failed(
    await step({ method: 'GET', url: params.presentation_definition_uri, sender: wallet, receiver: verifierName, protocol: 'OpenID4VP', action: 'Fetch presentation definition' }),
    'Presentation definition'
  );

  // The wallet presents only the requested claims, after the tamper option (if any).
  const prepared = await prepareCredential('sd-jwt', credential, tamper);
  const token: string = typeof prepared === 'string' ? prepared : prepared?.rawToken ?? '';
  const wanted = new Set(Object.values(REQUESTED_CLAIMS).flat());
  const disclosed = (disclosuresOf(token) ?? []).filter(([, name]) => wanted.has(name)).map(([encoded]) => `${encoded}~`).join('');
  const vpToken = `${token.split('~')[0]}~${disclosed}`;
  const submission = { id: 'playground-submission', definition_id: definition.id, descriptor_map: [{ id: definition.input_descriptors?.[0]?.id, format: 'vc+sd-jwt', path: '$' }] };

  const answer = await step({
    method: 'POST',
    url: params.response_uri,
    contentType: 'application/x-www-form-urlencoded',
    anyBody: true,
    body: { vp_token: vpToken, presentation_submission: JSON.stringify(submission), state: params.state },
    sender: wallet,
    receiver: verifierName,
    protocol: 'OpenID4VP',
    action: 'VP Token Submission (/response)',
    tampered
  });
  const session: any = (
    await liveCall({ method: 'GET', url: `${verifier}/openid4vc/session/${params.state}`, sender: wallet, receiver: verifierName, protocol: 'OpenID4VP', action: 'Fetch verification result' }).then(
      result => {
        emit(result.log);
        return result;
      }
    )
  ).data;
  if (typeof session?.verificationResult !== 'boolean') throw new CollabUnavailable(`${new URL(verifier).host} returned no verification result`);

  // Which policy failed? (policy results list each credential's policies)
  const policies: any[] = (session.policyResults?.results ?? []).flatMap((r: any) => r.policyResults ?? r.policies ?? []);
  const firstFailure = policies.find(p => p.is_success === false || p.success === false);
  const policyName = String(firstFailure?.policy ?? firstFailure?.id ?? '').split(' ')[0];
  const valid = session.verificationResult === true;
  const status = valid ? 'VALID' : VERDICT_BY_POLICY[policyName] ?? (answer.status === 400 && /signature/i.test(JSON.stringify(answer.data)) ? 'SIGNATURE_MISMATCH' : 'INVALID');
  const detail = valid ? '' : String(answer.data?.message ?? answer.data ?? 'Verification policies did not succeed').slice(0, 300);
  const claims = Object.fromEntries((disclosuresOf(vpToken) ?? []).map(([, name, value]) => [name, value]));
  return {
    status: status as 'VALID' | 'INVALID' | 'EXPIRED' | 'SIGNATURE_MISMATCH',
    claims,
    clientId: String(params.client_id),
    nonce: String(params.nonce),
    presentationDefinition: definition,
    checks: {
      formatCheck: true,
      signatureValid: status !== 'SIGNATURE_MISMATCH' && (valid || status === 'EXPIRED'),
      notExpired: status !== 'EXPIRED',
      schemaCompliant: true
    },
    details: valid
      ? 'Walt.id verified the issuer signature and validity (signature, expired and not-before policies). It does not check a key-binding JWT, so there is no holder binding or replay protection.'
      : `Walt.id verifier: ${detail}`
  };
}
