import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createAuditClient } from '../middleware/auditInterceptor.js';
import globalAuditBuffer from '../utils/RingBuffer.js';

const router = Router();

// Define Base URLs via Environment Variables
const TARGETS = {
  INJI_CERTIFY: process.env.MOSIP_CERTIFY_URL || 'https://collab.mosip.io/inji-certify',
  INJI_VERIFY: process.env.MOSIP_VERIFY_URL || 'https://collab.mosip.io/inji-verify',
  MOCK_ISSUER: process.env.MOCK_URL || 'http://localhost:5001/mock-issuer',
  MOCK_VERIFIER: process.env.MOCK_URL || 'http://localhost:5001/mock-verifier'
};

/**
 * STANDARD WILDCARD PROXY
 * Frontend calls: /api/proxy/INJI_CERTIFY/v1/credential-offer
 * Proxy routes to: https://collab.mosip.io/inji-certify/v1/credential-offer
 */
// Express 5 (path-to-regexp v8) requires named wildcards: '*splat', not '*'.
router.all('/api/proxy/:targetService/*splat', async (req, res) => {
  const { targetService } = req.params;
  
  // 1. Resolve Target Base URL
  const baseUrl = TARGETS[targetService.toUpperCase()];
  if (!baseUrl) {
    return res.status(400).json({ error: `Unknown routing target: ${targetService}` });
  }

  // 2. Reconstruct the exact path the frontend requested
  // Removes '/api/proxy/INJI_CERTIFY' to isolate the actual MOSIP endpoint
  const endpointPath = req.originalUrl.replace(`/api/proxy/${targetService}`, '');
  const destinationUrl = `${baseUrl}${endpointPath}`;

  // 3. Initialize the Audit Client (The work you just finished)
  const transactionId = req.headers['x-transaction-id'] || `tx-${uuidv4().substring(0, 8)}`;
  const isSandbox = targetService.startsWith('INJI');
  
  const auditClient = createAuditClient({
    transactionId,
    isSandbox,
    origin: 'BFF_Proxy_Gateway'
  });

  try {
    // 4. Forward the exact HTTP Method, Body, and sanitized Headers
    const response = await auditClient({
      method: req.method,
      url: destinationUrl,
      data: req.body,
      // Pass along frontend headers, but remove host so MOSIP doesn't reject it
      headers: {
        ...req.headers,
        host: undefined, 
        'X-Audit-Destination': targetService,
        // (Optional) Inject secure API keys here if required by MOSIP
        // 'Authorization': `Bearer ${process.env.MOSIP_API_KEY}`
      }
    });

    // 5. Fetch the recorded Wireshark frames for this specific call
    const recordedFrames = globalAuditBuffer.getByTransactionId(transactionId);

    // 6. Return the exact MOSIP response coupled with your Audit Logs
    return res.status(response.status).json({
      ...response.data,
      _auditTrail: recordedFrames
    });

  } catch (error) {
    const status = error.response ? error.response.status : 500;
    const data = error.response ? error.response.data : { message: error.message };
    const recordedFrames = globalAuditBuffer.getByTransactionId(transactionId);

    return res.status(status).json({
      ...data,
      _auditTrail: recordedFrames
    });
  }
});

export default router;