const SENSITIVE_KEYS = new Set([
  'authorization', 'dpop', 'cookie', 'set-cookie', 
  'client_secret', 'access_token', 'refresh_token', 
  'id_token', 'client_assertion',
  // OpenID4VCI grant secrets: whoever holds these can redeem the credential.
  'pre-authorized_code', 'tx_code', 'user_pin', 'code', 'code_verifier',
  'password', 'proxy-authorization', 'x-api-key', 'api_key',
  // eSignet login: CSRF token and the OTP / PIN sent as an auth challenge.
  'x-xsrf-token', 'challenge'
]);

// VC artefacts (vp_token, credential, proof) are kept for the inspector: none
// of their keys are sensitive, but they are still scanned, so a secret nested
// inside one is masked.

/**
 * Recursively scans and masks sensitive keys in HTTP headers and JSON bodies.
 */
export function redactPayload(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(redactPayload);

  const redacted = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    if (SENSITIVE_KEYS.has(lowerKey)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      redacted[key] = redactPayload(value);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}