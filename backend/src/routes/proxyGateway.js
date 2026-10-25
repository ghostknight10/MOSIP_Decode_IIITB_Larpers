import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createAuditClient } from '../middleware/auditInterceptor.js';
import globalAuditBuffer from '../utils/RingBuffer.js';

const router = Router();

// E-2 FIX: Added INJI_MIMOTO to TARGETS
// E-1 FIX : standardize the names across files
const TARGETS = {
  INJI_CERTIFY: process.env.MOSIP_INJI_CERTIFY_URL || 'https://certify.collab.mosip.net',
  INJI_VERIFY: process.env.MOSIP_INJI_VERIFY_URL || 'https://verify.collab.mosip.net',
  INJI_MIMOTO: process.env.MOSIP_INJI_MIMOTO_URL || 'https://mimoto.collab.mosip.net',
  MOCK_ISSUER: process.env.MOCK_URL || 'http://localhost:5001/mock-issuer',
  MOCK_VERIFIER: process.env.MOCK_URL || 'http://localhost:5001/mock-verifier'
};

// Express 5 named wildcards
router.all('/api/proxy/:targetService/*splat', async (req, res) => {
  const { targetService } = req.params;
  
  const baseUrl = TARGETS[targetService.toUpperCase()];
  if (!baseUrl) {
    return res.status(400).json({ error: `Unknown routing target: ${targetService}` });
  }

  const endpointPath = req.originalUrl.replace(`/api/proxy/${targetService}`, '');
  const destinationUrl = `${baseUrl}${endpointPath}`;

  const transactionId = req.headers['x-transaction-id'] || `tx-${uuidv4().substring(0, 8)}`;
  const isSandbox = targetService.startsWith('INJI');
  
  const auditClient = createAuditClient({
    transactionId,
    isSandbox,
    origin: 'BFF_Proxy_Gateway'
  });

  try {
    const response = await auditClient({
      method: req.method,
      url: destinationUrl,
      data: req.body,
      headers: {
        ...req.headers,
        host: undefined, 
        'X-Audit-Destination': targetService,
      }
    });

    const recordedFrames = globalAuditBuffer.getByTransactionId(transactionId);

    // B-2 FIX: Safely attach audit trails without mangling non-JSON responses
    const isObject = typeof response.data === 'object' && response.data !== null && !Array.isArray(response.data);
    
    return res.status(response.status).json(
      isObject 
        ? { ...response.data, _auditTrail: recordedFrames }
        : { data: response.data, _auditTrail: recordedFrames }
    );

  } catch (error) {
    const status = error.response ? error.response.status : 500;
    const data = error.response ? error.response.data : { message: error.message };
    const recordedFrames = globalAuditBuffer.getByTransactionId(transactionId);
    
    const isErrorObject = typeof data === 'object' && data !== null && !Array.isArray(data);

    return res.status(status).json(
      isErrorObject
        ? { ...data, _auditTrail: recordedFrames }
        : { data, _auditTrail: recordedFrames }
    );
  }
});

export default router;