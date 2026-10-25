import axios from 'axios';
import globalAuditBuffer from '../utils/RingBuffer.js';
import { redactPayload } from '../utils/redactor.js';

function enforceComplianceStandard(protocolInput, standardInput) {
  const input = `${protocolInput} ${standardInput}`.toUpperCase();
  if (input.includes('OPENID4VP') || input.includes('DRAFT 21')) {
    return { protocol: 'OpenID4VP', standard: 'OpenID4VP Draft 21' };
  }
  return { protocol: 'OpenID4VCI', standard: 'OpenID4VCI Draft 13' };
}

function enforceCredentialFormat(formatInput) {
  const input = (formatInput || '').toUpperCase();
  if (input.includes('SD-JWT') || input.includes('VC+SD-JWT')) {
    return 'IETF SD-JWT VC (vc+sd-jwt)';
  }
  return 'W3C VC (JSON-LD)';
}

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
    
    const rawProtocol = config.headers?.['X-Audit-Protocol'] || '';
    const rawStandard = config.headers?.['X-Audit-Standard'] || '';
    const rawFormat = config.headers?.['X-Audit-Format'] || '';
    
    const { protocol, standard } = enforceComplianceStandard(rawProtocol, rawStandard);
    const credentialFormat = enforceCredentialFormat(rawFormat);

    const destination = config.headers?.['X-Audit-Destination'] || 'UNKNOWN';
    const specStep = config.headers?.['X-Audit-SpecStep'] || 'HTTP Call';
    const isTampered = config.headers?.['X-Audit-Tampered'] === 'true';
    const tamperMessage = config.headers?.['X-Audit-Tamper-Msg'] || null;

    // B-1 FIX: Safely parse JSON, fallback to raw string for form-urlencoded
    let safeBody = config.data;
    if (typeof config.data === 'string') {
      try {
        safeBody = JSON.parse(config.data);
      } catch (e) {
        // Leave as string if parsing fails
      }
    }

    const frame = {
      transactionId,
      sequenceNo: sequenceCounter++,
      isSandbox,
      origin,
      destination,
      tamperFlag: isTampered ? { isTampered, message: tamperMessage } : null,
      protocolContext: {
        protocol,
        complianceStandard: standard,
        credentialFormat,
        specStep
      },
      packet: {
        latencyMs,
        request: {
          method: config.method?.toUpperCase(),
          url: config.url,
          headers: redactPayload(config.headers),
          body: safeBody ? redactPayload(safeBody) : null
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