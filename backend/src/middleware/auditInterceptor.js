import axios from 'axios';
import globalAuditBuffer from '../utils/RingBuffer.js';
import { redactPayload } from '../utils/redactor.js';

// --- Strict Enum Enforcers ---

function enforceComplianceStandard(protocolInput, standardInput) {
  const input = `${protocolInput} ${standardInput}`.toUpperCase();
  // If the flow is explicitly VP, enforce Draft 21
  if (input.includes('OPENID4VP') || input.includes('DRAFT 21')) {
    return { protocol: 'OpenID4VP', standard: 'OpenID4VP Draft 21' };
  }
  // Default fallback for VCI is Draft 13
  return { protocol: 'OpenID4VCI', standard: 'OpenID4VCI Draft 13' };
}

function enforceCredentialFormat(formatInput) {
  const input = (formatInput || '').toUpperCase();
  // Route any SD-JWT variations to the strict IETF definition
  if (input.includes('SD-JWT') || input.includes('VC+SD-JWT')) {
    return 'IETF SD-JWT VC (vc+sd-jwt)';
  }
  // Default to W3C JSON-LD and strip out any mDoc/ISO attempts
  return 'W3C VC (JSON-LD)';
}

// ------------------------------

/**
 * Creates a proxied Axios client that automatically logs traffic to the Ring Buffer.
 */
export function createAuditClient({ 
  transactionId, 
  isSandbox, 
  origin = 'BFF_Gateway' 
}) {
  const client = axios.create();
  let sequenceCounter = 1;

  client.interceptors.request.use((config) => {
    config.metadata = { startTime: Date.now() };
    return config;
  });

  client.interceptors.response.use(
    (response) => {
      logFrame(response, null);
      return response;
    },
    (error) => {
      logFrame(error.response || error, error);
      return Promise.reject(error);
    }
  );

  function logFrame(responseOrError, errorObj) {
    const config = responseOrError.config || {};
    const metadata = config.metadata || { startTime: Date.now() };
    const latencyMs = Date.now() - metadata.startTime;
    
    // Read raw headers passed from the route
    const rawProtocol = config.headers?.['X-Audit-Protocol'] || '';
    const rawStandard = config.headers?.['X-Audit-Standard'] || '';
    const rawFormat = config.headers?.['X-Audit-Format'] || '';
    
    // ENFORCE SPECIFICATIONS (Coerces invalid/mDoc inputs to strict targets)
    const { protocol, standard } = enforceComplianceStandard(rawProtocol, rawStandard);
    const credentialFormat = enforceCredentialFormat(rawFormat);

    const destination = config.headers?.['X-Audit-Destination'] || 'UNKNOWN';
    const specStep = config.headers?.['X-Audit-SpecStep'] || 'HTTP Call';
    const isTampered = config.headers?.['X-Audit-Tampered'] === 'true';
    const tamperMessage = config.headers?.['X-Audit-Tamper-Msg'] || null;

    // Build the strict Audit Frame schema
    const frame = {
      transactionId,
      sequenceNo: sequenceCounter++,
      isSandbox,
      origin,
      destination,
      tamperFlag: isTampered ? { isTampered, message: tamperMessage } : null,
      protocolContext: {
        protocol,
        complianceStandard: standard, // Strictly enforced: "OpenID4VCI Draft 13" or "OpenID4VP Draft 21"
        credentialFormat,             // Strictly enforced: "W3C VC (JSON-LD)" or "IETF SD-JWT VC (vc+sd-jwt)"
        specStep
      },
      packet: {
        latencyMs,
        request: {
          method: config.method?.toUpperCase(),
          url: config.url,
          headers: redactPayload(config.headers),
          body: config.data ? redactPayload(JSON.parse(config.data)) : null
        },
        response: {
          statusCode: responseOrError.status || 500,
          headers: redactPayload(responseOrError.headers || {}),
          body: redactPayload(responseOrError.data || {})
        }
      }
    };

    globalAuditBuffer.add(frame);
  }

  return client;
}