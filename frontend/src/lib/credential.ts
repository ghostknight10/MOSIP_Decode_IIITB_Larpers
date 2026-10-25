import { CredentialFormat } from '../types';

/**
 * Pure helpers for presenting credentials and building OpenID4VC request URIs.
 */

// Practical QR byte capacity at error-correction level L; larger payloads are
// a real interop gap (see problem statement), so we surface it instead of crashing.
export const QR_MAX_BYTES = 2900;

export const buildOfferUri = (offer: any) =>
  `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(offer))}`;

export const buildVpRequestUri = (pd: any, clientId: string, nonce: string) =>
  'openid4vp://authorize?' +
  new URLSearchParams({
    response_type: 'vp_token',
    response_mode: 'direct_post',
    client_id: clientId,
    nonce,
    presentation_definition: JSON.stringify(pd)
  }).toString();

/** A BFF reference path as an absolute URL a phone on the same network can fetch. */
export const absoluteUrl = (path: string, origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin) =>
  new URL(path, origin).href;

/** The offer passed by reference (G-1), for offers too large for a QR code. */
export const buildOfferUriByReference = (offerUrl: string) =>
  `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(offerUrl)}`;

/** The authorization request with presentation_definition_uri instead of the definition itself. */
export const buildVpRequestUriByReference = (pdUrl: string, clientId: string, nonce: string) =>
  'openid4vp://authorize?' +
  new URLSearchParams({
    response_type: 'vp_token',
    response_mode: 'direct_post',
    client_id: clientId,
    nonce,
    presentation_definition_uri: pdUrl
  }).toString();

/** Decodes the payload of the JWT part of a (SD-)JWT, or null if malformed. */
export const decodeJwtPayload = (jwt: string) => {
  try {
    const part = jwt.split('~')[0].split('.')[1];
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
};

/** Normalise the two credential shapes into a few display fields. */
export const summarise = (credential: any, format: CredentialFormat) => {
  if (format === 'sd-jwt') {
    const payload = credential?.rawToken ? decodeJwtPayload(credential.rawToken) : null;
    const disclosures = credential?.rawToken ? credential.rawToken.split('~').slice(1).filter(Boolean).length : 0;
    return {
      issuer: payload?.iss ?? credential?.decoded?.payload?.iss,
      type: payload?.vct ?? credential?.decoded?.payload?.vct,
      expires: payload?.exp ? new Date(payload.exp * 1000).toISOString() : undefined,
      extra: `${disclosures} selective disclosure${disclosures === 1 ? '' : 's'}`
    };
  }
  return {
    issuer: credential?.issuer?.id ?? credential?.issuer,
    type: Array.isArray(credential?.type) ? credential.type.filter((t: string) => t !== 'VerifiableCredential').join(', ') : credential?.type,
    expires: credential?.expirationDate,
    extra: credential?.proof?.verificationMethod
  };
};
