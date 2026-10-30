import { QR_MAX_BYTES } from './credential';

/**
 * Credential-in-QR with MOSIP's PixelPass (zlib + base45, and CBOR for JSON):
 * the encoding Inji Verify's QR scanner reads. A credential too big for a QR
 * as plain text (G-1) often fits once compressed. Loaded on demand: the
 * library brings CBOR, zip and QR code generators the rest of the app doesn't need.
 */
export interface QrEncoding {
  /** The text to put in the QR code. */
  data: string;
  /** Size of the credential as the issuer produced it (UTF-8 bytes). */
  rawBytes: number;
  /** Size of the PixelPass text. */
  encodedBytes: number;
  /** Whether the PixelPass text fits one QR code. */
  fits: boolean;
}

/** What to encode: the JSON for W3C credentials, the compact token for SD-JWT, the CBOR for mDoc. */
export const credentialText = (credential: unknown): string => {
  if (typeof credential === 'string') return credential;
  const c = credential as { rawToken?: string; issuerSigned?: string } | null;
  if (typeof c?.rawToken === 'string') return c.rawToken;
  if (typeof c?.issuerSigned === 'string') return c.issuerSigned;
  return JSON.stringify(credential);
};

export async function encodeForQr(credential: unknown): Promise<QrEncoding> {
  const { generateQRData } = await import('@mosip/pixelpass');
  const text = credentialText(credential);
  const data: string = generateQRData(text);
  const bytes = (value: string) => new TextEncoder().encode(value).length;
  return { data, rawBytes: bytes(text), encodedBytes: bytes(data), fits: bytes(data) <= QR_MAX_BYTES };
}

/** The reverse, as a scanner does it. */
export async function decodeQr(data: string): Promise<string> {
  const { decode } = await import('@mosip/pixelpass');
  return decode(data);
}
