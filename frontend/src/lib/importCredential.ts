import { CredentialFormat } from '../types';
import { parseSdJwt } from './sdjwt';

/**
 * Reads a credential obtained outside the playground (for example downloaded
 * with Inji Web after an eSignet login), so the wallet can hold and present a
 * real Inji credential. Accepts a W3C credential as JSON, possibly wrapped as
 * { credential } or { verifiableCredential }, a compact SD-JWT, or an mDoc
 * IssuerSigned structure (base64url CBOR).
 */
export type ImportResult = { format: CredentialFormat; credential: any } | { error: string };

const unwrap = (value: any): any => {
  for (const key of ['credential', 'verifiableCredential', 'vc']) {
    const inner = Array.isArray(value?.[key]) ? value[key][0] : value?.[key];
    if (inner && typeof inner === 'object' && !value?.credentialSubject) return unwrap(inner);
  }
  return value;
};

export const parseImportedCredential = (text: string): ImportResult => {
  const input = text.trim();
  if (!input) return { error: 'Paste a credential first.' };

  if (input.startsWith('{')) {
    let json: any;
    try {
      json = JSON.parse(input);
    } catch {
      return { error: 'This looks like JSON but does not parse.' };
    }
    const credential = unwrap(json);
    if (typeof credential === 'string') return parseImportedCredential(credential);
    if (!credential?.credentialSubject || !credential?.proof) {
      return { error: 'Expected a W3C verifiable credential with credentialSubject and proof.' };
    }
    return { format: 'w3c-vc', credential };
  }

  // An mDoc IssuerSigned structure: base64url CBOR, decoded and verified by the BFF.
  if (!input.includes('~') && !input.includes('.') && /^[A-Za-z0-9_-]{40,}$/.test(input)) {
    return { format: 'mso-mdoc', credential: { format: 'mso_mdoc', issuerSigned: input, decoded: {} } };
  }

  const parsed = input.includes('~') ? parseSdJwt(input) : null;
  if (!parsed) return { error: 'Not a W3C credential (JSON), an SD-JWT (<jwt>~<disclosure>~...) or an mDoc (base64url CBOR).' };
  return {
    format: 'sd-jwt',
    credential: {
      format: parsed.header?.typ ?? 'vc+sd-jwt',
      rawToken: input,
      decoded: {
        header: { alg: parsed.header?.alg, typ: parsed.header?.typ },
        payload: {
          iss: parsed.payload?.iss,
          vct: parsed.payload?.vct,
          exp: parsed.payload?.exp,
          claims: Object.fromEntries(parsed.disclosures.flatMap(d => (d.name ? [[d.name, d.value]] : [])))
        }
      }
    }
  };
};
