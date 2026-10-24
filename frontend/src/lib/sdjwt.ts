/**
 * Minimal SD-JWT VC parsing for display (IETF SD-JWT: `<jwt>~<disclosure>~...~[<kb-jwt>]`).
 * This decodes and cross-checks structure; it does not verify signatures.
 */

export interface Disclosure {
  raw: string;
  salt?: string;
  /** Claim name; absent for array-element disclosures. */
  name?: string;
  value?: unknown;
  error?: string;
}

export interface ParsedSdJwt {
  jwt: string;
  header: any;
  payload: any;
  signature: string;
  disclosures: Disclosure[];
  keyBinding: { header: any; payload: any } | null;
}

export const base64UrlDecode = (input: string): string => {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const base64UrlEncode = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const decodeJson = (segment: string) => JSON.parse(base64UrlDecode(segment));

const parseDisclosure = (raw: string): Disclosure => {
  try {
    const arr = decodeJson(raw);
    if (!Array.isArray(arr) || (arr.length !== 2 && arr.length !== 3)) return { raw, error: 'Not a [salt, (name,) value] array' };
    return arr.length === 3 ? { raw, salt: arr[0], name: arr[1], value: arr[2] } : { raw, salt: arr[0], value: arr[1] };
  } catch {
    return { raw, error: 'Not valid base64url JSON' };
  }
};

/** Splits and decodes an SD-JWT; returns null if the issuer JWT itself is malformed. */
export const parseSdJwt = (raw: string): ParsedSdJwt | null => {
  const parts = raw.split('~');
  const jwt = parts[0];
  const [h, p, signature = ''] = jwt.split('.');
  let header, payload;
  try {
    header = decodeJson(h);
    payload = decodeJson(p);
  } catch {
    return null;
  }
  const rest = parts.slice(1);
  // A trailing segment containing dots is a key-binding JWT; otherwise the token ends with '~'.
  const last = rest[rest.length - 1];
  let keyBinding: ParsedSdJwt['keyBinding'] = null;
  if (last && last.includes('.')) {
    rest.pop();
    try {
      const [kh, kp] = last.split('.');
      keyBinding = { header: decodeJson(kh), payload: decodeJson(kp) };
    } catch {
      keyBinding = null;
    }
  }
  return { jwt, header, payload, signature, disclosures: rest.filter(Boolean).map(parseDisclosure), keyBinding };
};

/**
 * For each disclosure, whether its SHA-256 digest appears in the payload's
 * top-level `_sd` array. 'unavailable' when WebCrypto is missing (non-secure
 * contexts such as the UI opened over a LAN IP).
 */
export const verifyDisclosureDigests = async (parsed: ParsedSdJwt): Promise<boolean[] | 'unavailable'> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return 'unavailable';
  const sd: string[] = Array.isArray(parsed.payload?._sd) ? parsed.payload._sd : [];
  return Promise.all(
    parsed.disclosures.map(async d => sd.includes(base64UrlEncode(await subtle.digest('SHA-256', new TextEncoder().encode(d.raw)))))
  );
};
