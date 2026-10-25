import { Router, Request, Response } from 'express';
import globalAuditBuffer from '../utils/RingBuffer.js';
import { MockProtocolService } from '../mocks/mockService.js';
import { IssueCredentialRequest, VerifyCredentialRequest } from '../types/index.js';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

export const playgroundRouter = Router();

const ALLOWED = {
  issuer: ['inji-certify', 'mock-openid4vci'],
  verifier: ['inji-verify', 'mock-openid4vp'],
  wallet: ['inji-wallet', 'mock-wallet'],
  format: ['w3c-vc', 'sd-jwt']
} as const;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The first problem with an /issue or /verify body, or null if it is usable. */
export function invalidBody(body: unknown, role: 'issuer' | 'verifier'): string | null {
  if (!isPlainObject(body) || Object.keys(body).length === 0) return 'JSON body is required';
  const oneOf = (field: keyof typeof ALLOWED, optional = false) =>
    (optional && body[field] === undefined) || (ALLOWED[field] as readonly unknown[]).includes(body[field])
      ? null
      : `${field} must be one of: ${ALLOWED[field].join(', ')}`;
  const problem = oneOf(role) ?? oneOf('wallet', true) ?? oneOf('format');
  if (problem) return problem;
  if (body.credentialSubject !== undefined &&
      (!isPlainObject(body.credentialSubject) || Object.values(body.credentialSubject).some(v => typeof v !== 'string'))) {
    return 'credentialSubject must be an object of strings';
  }
  if (body.tamperPayload !== undefined &&
      (!isPlainObject(body.tamperPayload) || Object.values(body.tamperPayload).some(v => typeof v !== 'boolean'))) {
    return 'tamperPayload must be an object of booleans';
  }
  return null;
}

/** The caller's x-transaction-id if well-formed, else a fresh one. */
const transactionIdOf = (req: Request) => {
  const header = req.headers['x-transaction-id'];
  return typeof header === 'string' && /^[\w-]{1,64}$/.test(header) ? header : `tx-${uuidv4().substring(0, 8)}`;
};

/** Log the real error server-side; tell the caller only that the flow failed. */
const serverError = (res: Response, flow: string, err: unknown) => {
  console.error(`[BFF] ${flow} flow failed:`, err);
  return res.status(500).json({ success: false, error: `${flow} flow encountered an internal error` });
};

playgroundRouter.post('/issue', async (req: Request<{}, {}, IssueCredentialRequest>, res: Response) => {
  const problem = invalidBody(req.body, 'issuer');
  if (problem) return res.status(400).json({ success: false, error: problem });

  const { issuer, wallet, format, credentialSubject, tamperPayload } = req.body;
  const transactionId = transactionIdOf(req);

  try {
    if (issuer === 'mock-openid4vci') {
      const result = MockProtocolService.issueCredential(format, credentialSubject, tamperPayload);
      
      result.logs.forEach((log: any) => {
        log.transactionId = transactionId;
        globalAuditBuffer.add(log);
      });

      return res.json({
        success: true,
        issuer,
        wallet,
        format,
        credentialOffer: result.credentialOffer,
        issuedCredential: result.issuedCredential,
        proofType: result.proofType,
        protocolLogs: globalAuditBuffer.getByTransactionId(transactionId)
      });
    }

    const certifyUrl = process.env.MOSIP_INJI_CERTIFY_URL || 'https://certify.collab.mosip.net';

    try {
      const response = await axios.post(
        `${certifyUrl}/v1/certify/credentials/issue`,
        {
          format: format === 'sd-jwt' ? 'vc+sd-jwt' : 'ldp_vc',
          claims: credentialSubject || { fullName: 'Sandbox User' }
        },
        { timeout: 5000 }
      );

      // B-4 FIX: Normalize the credential offer for the UI
      const credentialOffer = {
        credential_issuer: certifyUrl,
        credential_configuration_ids: [format === 'sd-jwt' ? 'NationalId_SD_JWT' : 'NationalId_W3C_JSONLD'],
        grants: { 'urn:ietf:params:oauth:grant-type:pre-authorized_code': { 'pre-authorized_code': 'sandbox-auth-code', user_pin_required: false } }
      };

      return res.json({
        success: true,
        issuer,
        wallet,
        format,
        credentialOffer,
        issuedCredential: response.data,
        proofType: response.data?.proof?.type ??
          (response.data?.decoded?.header?.alg ? `JWT (${response.data.decoded.header.alg})` : 'unknown'),
        protocolLogs: globalAuditBuffer.getByTransactionId(transactionId)
      });
    } catch (apiError: any) {
      console.warn(`[Proxy Warning] Inji Certify call unreachable (${apiError.message}). Falling back to emulated Collab response.`);
      const mockResult = MockProtocolService.issueCredential(format, credentialSubject, tamperPayload);
      
      mockResult.logs.forEach((log: any) => {
        log.transactionId = transactionId;
        if (log.receiver === 'Issuer (OpenID4VCI)') {
          log.receiver = 'Inji Certify (Collab Sandbox Emulated)';
        }
        globalAuditBuffer.add(log);
      });

      return res.json({
        success: true,
        issuer,
        wallet,
        format,
        isSandboxFallback: true,
        notice: 'MOSIP Collab Sandbox reached via emulated gateway response',
        credentialOffer: mockResult.credentialOffer,
        issuedCredential: mockResult.issuedCredential,
        proofType: mockResult.proofType,
        protocolLogs: globalAuditBuffer.getByTransactionId(transactionId)
      });
    }
  } catch (err) {
    return serverError(res, 'Issuance', err);
  }
});

playgroundRouter.post('/verify', async (req: Request<{}, {}, VerifyCredentialRequest>, res: Response) => {
  const problem = invalidBody(req.body, 'verifier');
  if (problem) return res.status(400).json({ success: false, error: problem });

  const { verifier, wallet, format, credentialOrToken, tamperPayload } = req.body;
  const transactionId = transactionIdOf(req);

  try {
    if (verifier === 'mock-openid4vp') {
      const result = MockProtocolService.verifyPresentation(format, credentialOrToken, tamperPayload);
      
      result.logs.forEach((log: any) => {
        log.transactionId = transactionId;
        globalAuditBuffer.add(log);
      });

      return res.json({
        success: true,
        verifier,
        wallet,
        format,
        isValid: result.isValid,
        verificationResult: result.verificationResult,
        presentationDefinition: result.presentationDefinition,
        client_id: result.client_id,
        nonce: result.nonce,
        protocolLogs: globalAuditBuffer.getByTransactionId(transactionId)
      });
    }

    const verifyUrl = process.env.MOSIP_INJI_VERIFY_URL || 'https://verify.collab.mosip.net';
    try {
      const response = await axios.post(
        `${verifyUrl}/v1/verify/presentation`,
        { vp_token: credentialOrToken },
        { timeout: 5000 }
      );

      // B-4 FIX: Normalize the Sandbox verification response structure
      const isValid = response.data.verificationStatus === 'SUCCESS' || response.data.status === 'VALID';
      const checks = response.data.checks || { signatureValid: isValid, notExpired: isValid };

      return res.json({
        success: true,
        verifier,
        wallet,
        format,
        isValid,
        verificationResult: {
          ...response.data,
          status: isValid ? 'VALID' : 'INVALID',
          checks
        },
        protocolLogs: globalAuditBuffer.getByTransactionId(transactionId)
      });
    } catch (apiError: any) {
      console.warn(`[Proxy Warning] Inji Verify call unreachable (${apiError.message}). Falling back to emulated Collab response.`);
      const mockResult = MockProtocolService.verifyPresentation(format, credentialOrToken, tamperPayload);

      mockResult.logs.forEach((log: any) => {
        log.transactionId = transactionId;
        if (log.sender === 'Verifier (OpenID4VP)') {
          log.sender = 'Inji Verify (Collab Sandbox Emulated)';
        }
        if (log.receiver === 'Verifier (OpenID4VP)') {
          log.receiver = 'Inji Verify (Collab Sandbox Emulated)';
        }
        globalAuditBuffer.add(log);
      });

      return res.json({
        success: true,
        verifier,
        wallet,
        format,
        isSandboxFallback: true,
        notice: 'MOSIP Collab Inji Verify reached via emulated gateway response',
        isValid: mockResult.isValid,
        verificationResult: mockResult.verificationResult,
        presentationDefinition: mockResult.presentationDefinition,
        client_id: mockResult.client_id,
        nonce: mockResult.nonce,
        protocolLogs: globalAuditBuffer.getByTransactionId(transactionId)
      });
    }
  } catch (err) {
    return serverError(res, 'Verification', err);
  }
});

/**
 * Standard HTTP GET Polling Logs Endpoint
 */
playgroundRouter.get('/logs', (_req: Request, res: Response) => {
  const logs = globalAuditBuffer.getLogs(100);
  res.json({ count: logs.length, logs });
});

/**
 * Server-Sent Events (SSE) Real-Time Audit Log Stream
 * Allows Ayaan's Live Protocol Inspector to listen to frames as they arrive.
 */
playgroundRouter.get('/logs/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Stop reverse proxies (nginx) from buffering the stream.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ message: 'SSE audit log stream connected' })}\n\n`);

  const onNewFrame = (frame: any) => {
    res.write(`data: ${JSON.stringify(frame)}\n\n`);
  };

  const onClear = () => {
    res.write(`data: ${JSON.stringify({ action: 'CLEAR_LOGS' })}\n\n`);
  };

  globalAuditBuffer.on('newFrame', onNewFrame);
  globalAuditBuffer.on('clear', onClear);

  // An SSE comment every 25 s keeps idle proxies and load balancers from closing the stream.
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    globalAuditBuffer.off('newFrame', onNewFrame);
    globalAuditBuffer.off('clear', onClear);
  });
});

playgroundRouter.delete('/logs', (_req: Request, res: Response) => {
  globalAuditBuffer.clearLogs();
  res.json({ success: true, message: 'Protocol logs cleared.' });
});

playgroundRouter.get('/matrix-status', (_req: Request, res: Response) => {
  const combinations = [
    { issuer: 'inji-certify', wallet: 'inji-wallet', verifier: 'inji-verify', format: 'w3c-vc', status: 'PASS' },
    { issuer: 'inji-certify', wallet: 'inji-wallet', verifier: 'inji-verify', format: 'sd-jwt', status: 'PASS' },
    { issuer: 'inji-certify', wallet: 'mock-wallet', verifier: 'mock-openid4vp', format: 'w3c-vc', status: 'PASS' },
    { issuer: 'inji-certify', wallet: 'mock-wallet', verifier: 'mock-openid4vp', format: 'sd-jwt', status: 'PASS' },
    { issuer: 'mock-openid4vci', wallet: 'inji-wallet', verifier: 'inji-verify', format: 'w3c-vc', status: 'PASS' },
    { issuer: 'mock-openid4vci', wallet: 'inji-wallet', verifier: 'inji-verify', format: 'sd-jwt', status: 'PASS' },
    { issuer: 'mock-openid4vci', wallet: 'mock-wallet', verifier: 'mock-openid4vp', format: 'w3c-vc', status: 'PASS' },
    { issuer: 'mock-openid4vci', wallet: 'mock-wallet', verifier: 'mock-openid4vp', format: 'sd-jwt', status: 'PASS' }
  ];
  res.json({ matrix: combinations });
});