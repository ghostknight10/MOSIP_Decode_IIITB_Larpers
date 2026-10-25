import { CredentialFormat } from '../types';
import { parseSdJwt } from './sdjwt';

/**
 * Who holds what: compares the claims the verifier asked for (presentation
 * definition), the claims the wallet holds (credential) and the claims the
 * verifier actually received (verifiedClaims). Answers the "who controls my
 * data at this step" question users struggle with (Korir et al., SOUPS 2022).
 */

// JWT / SD-JWT VC registered and structural claims, not personal data.
const NON_SUBJECT_CLAIMS = new Set(['iss', 'sub', 'iat', 'exp', 'nbf', 'jti', 'vct', 'cnf', 'status', '_sd', '_sd_alg', 'id']);

const unique = (xs: string[]) => [...new Set(xs)];

/** Last segment of a JSONPath such as $.credentialSubject.fullName or $['credentialSubject']['dob']. */
export const claimFromPath = (path: string) => {
  const parts = path.replace(/\[['"]?([^'"\]]+)['"]?\]/g, '.$1').split('.').filter(p => p && p !== '$');
  return parts[parts.length - 1] ?? path;
};

const fieldsOf = (presentationDefinition: any): any[] =>
  (presentationDefinition?.input_descriptors ?? []).flatMap((d: any) => d?.constraints?.fields ?? []);

/** One name per requested field: the claim named by its first path. */
export const requestedClaims = (presentationDefinition: any): string[] =>
  unique(fieldsOf(presentationDefinition).map((f: any) => f?.path?.[0]).filter(Boolean).map(claimFromPath));

/**
 * Alternative claim names a field accepts (its other paths), mapped to the
 * field's first name. A field asking for nationalId or UIN is satisfied by UIN.
 */
export const claimAliases = (presentationDefinition: any): Record<string, string> =>
  Object.fromEntries(
    fieldsOf(presentationDefinition).flatMap((f: any) => {
      const names = unique((f?.path ?? []).map(claimFromPath));
      return names.slice(1).map(alias => [alias, names[0]]);
    })
  );

export const heldClaims = (credential: any, format: CredentialFormat): string[] => {
  if (format === 'sd-jwt' && typeof credential?.rawToken === 'string') {
    const parsed = parseSdJwt(credential.rawToken);
    if (parsed) {
      const disclosed = parsed.disclosures.flatMap(d => (d.name ? [d.name] : []));
      const inPayload = Object.keys(parsed.payload ?? {}).filter(k => !NON_SUBJECT_CLAIMS.has(k));
      return unique([...inPayload, ...disclosed]);
    }
  }
  const subject =
    format === 'sd-jwt' ? credential?.decoded?.payload?.claims : format === 'mso-mdoc' ? credential?.decoded?.claims : credential?.credentialSubject;
  return Object.keys(subject ?? {}).filter(k => !NON_SUBJECT_CLAIMS.has(k));
};

export const sharedClaims = (verifiedClaims: any, aliases: Record<string, string> = {}): string[] =>
  unique(
    Object.keys(verifiedClaims && typeof verifiedClaims === 'object' ? verifiedClaims : {})
      .filter(k => !NON_SUBJECT_CLAIMS.has(k))
      .map(k => aliases[k] ?? k)
  );

export interface ClaimClassification {
  /** Asked for and received. */
  requestedShared: string[];
  /** Received without being asked for: a data-minimisation problem. */
  overShared: string[];
  /** Asked for but not received. */
  missing: string[];
  /** Held by the wallet and not shared. */
  keptPrivate: string[];
}

export const classifyClaims = (requested: string[], held: string[], shared: string[]): ClaimClassification => ({
  requestedShared: requested.filter(c => shared.includes(c)),
  overShared: shared.filter(c => !requested.includes(c)),
  missing: requested.filter(c => !shared.includes(c)),
  keptPrivate: held.filter(c => !shared.includes(c))
});
