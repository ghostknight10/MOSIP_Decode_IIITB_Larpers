const SENSITIVE_KEYS = new Set([
  'authorization', 'dpop', 'cookie', 'set-cookie', 
  'client_secret', 'access_token', 'refresh_token', 
  'id_token', 'client_assertion'
]);

// Explicit exceptions that MUST be preserved for the UI Inspector
const VC_EXCEPTIONS = new Set([
  'vp_token', 'credential', 'credentials', 
  'verifiablecredential', 'proof'
]);

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
    } else if (VC_EXCEPTIONS.has(lowerKey)) {
      redacted[key] = value; // Explicitly preserve VC artifacts
    } else if (typeof value === 'object') {
      redacted[key] = redactPayload(value);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}