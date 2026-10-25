import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createAuditClient } from '../middleware/auditInterceptor.js';
import globalAuditBuffer from '../utils/RingBuffer.js';
import { collabTargets } from '../services/collab.js';

const router = Router();

// Read at request time: index.ts loads .env after its imports have run.
const targets = () => ({
  INJI_CERTIFY: collabTargets().certify,
  INJI_VERIFY: collabTargets().verify,
  INJI_MIMOTO: collabTargets().mimoto,
  MOCK_ISSUER: process.env.MOCK_URL || 'http://localhost:5001/mock-issuer',
  MOCK_VERIFIER: process.env.MOCK_URL || 'http://localhost:5001/mock-verifier'
});

// Only these caller headers reach MOSIP. Cookies, Host, the original
// Content-Length (the body is re-serialised) and hop-by-hop headers are dropped.
const FORWARDED_HEADERS = ['accept', 'accept-language', 'content-type', 'authorization', 'dpop', 'x-transaction-id'];
const forwardedHeaders = (headers) =>
  Object.fromEntries(
    Object.entries(headers).filter(([name]) => FORWARDED_HEADERS.includes(name) || name.startsWith('x-audit-'))
  );

// Express 5 named wildcards
router.all('/api/proxy/:targetService/*splat', async (req, res) => {
  const { targetService } = req.params;
  
  const target = targetService.toUpperCase();
  const baseUrl = Object.hasOwn(targets(), target) ? targets()[target] : undefined;
  if (!baseUrl) {
    return res.status(400).json({ error: `Unknown routing target: ${targetService}` });
  }

  // Rebuild the path from the matched segments, so case or percent-encoding in
  // the /api/proxy/<target> prefix can't leak into the upstream URL.
  const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  const endpointPath = `/${[].concat(req.params.splat).map(encodeURIComponent).join('/')}${query}`;
  const destinationUrl = `${baseUrl}${endpointPath}`;

  const transactionId = req.headers['x-transaction-id'] || `tx-${uuidv4().substring(0, 8)}`;
  const isSandbox = target.startsWith('INJI');
  const hasBody = !['GET', 'HEAD'].includes(req.method) && req.body !== undefined;
  
  const auditClient = createAuditClient({
    transactionId,
    isSandbox,
    origin: 'BFF_Proxy_Gateway'
  });

  try {
    const response = await auditClient({
      method: req.method,
      url: destinationUrl,
      data: hasBody ? req.body : undefined,
      headers: {
        ...forwardedHeaders(req.headers),
        'X-Audit-Destination': target
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
    // Don't echo internal error text (hostnames, stack details) to the caller.
    const data = error.response ? error.response.data : { error: 'Upstream request failed', code: error.code };
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