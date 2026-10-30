/**
 * OpenID4VP over the W3C Digital Credentials API: the browser asks a wallet on
 * the same device (an Android wallet, for instance) for a presentation, with no
 * QR code and no deep link. Experimental: it needs a browser that implements
 * the API (Chrome 141 and newer) and a wallet that handles the protocol.
 */
export const digitalCredentialsSupported = (): boolean =>
  typeof window !== 'undefined' && 'DigitalCredential' in window && typeof navigator !== 'undefined' && Boolean(navigator.credentials);

export interface DcRequestParams {
  presentationDefinition: unknown;
  clientId: string;
  nonce: string;
}

/** The OpenID4VP authorization request, as the API carries it (response_mode dc_api). */
export const buildDcRequest = ({ presentationDefinition, clientId, nonce }: DcRequestParams) => ({
  digital: {
    requests: [
      {
        protocol: 'openid4vp',
        data: { response_type: 'vp_token', response_mode: 'dc_api', client_id: clientId, nonce, presentation_definition: presentationDefinition }
      }
    ]
  }
});

export interface DcResponse {
  protocol: string;
  data: unknown;
}

/** A person-readable reason for a failed request. */
export const explainDcError = (error: unknown): string => {
  const name = (error as { name?: string })?.name;
  if (name === 'NotAllowedError') return 'The request was declined, or no wallet on this device could answer it.';
  if (name === 'AbortError') return 'The request was cancelled.';
  if (name === 'NotSupportedError') return 'This browser or device has no wallet for the openid4vp protocol.';
  if (name === 'SecurityError') return 'The browser only allows this from a secure (https) page.';
  return (error as Error)?.message ? `The browser refused the request: ${(error as Error).message}` : 'The browser refused the request.';
};

export async function requestViaDigitalCredentialsApi(params: DcRequestParams): Promise<DcResponse> {
  // The API's types are not in TypeScript's DOM library yet.
  const credential = (await (navigator.credentials as any).get({ ...buildDcRequest(params), mediation: 'required' })) as { protocol?: string; data?: unknown } | null;
  if (!credential) throw Object.assign(new Error('No credential returned'), { name: 'NotAllowedError' });
  return { protocol: String(credential.protocol ?? 'openid4vp'), data: credential.data };
}
