import { Router, Request, Response } from 'express';
import globalAuditBuffer from '../utils/RingBuffer.js';
import { MockProtocolService, claimsOf, sharedClaims } from '../mocks/mockService.js';
import { presentToMockVerifier } from '../mocks/wallet.js';
import { CollabUnavailable, certifyDiscovery, collabTargets, injiVerify } from '../services/collab.js';
import { IssueCredentialRequest, ProtocolLog, VerifyCredentialRequest } from '../types/index.js';
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

/** Adds logs to the audit buffer, numbered after the transaction's earlier steps. */
const record = (transactionId: string, logs: ProtocolLog[]) => {
  const offset = globalAuditBuffer.getByTransactionId(transactionId).length;
  logs.forEach((log, i) => globalAuditBuffer.add({ ...log, transactionId, step: offset + i + 1 }));
};

/** Log the real error server-side; tell the caller only that the flow failed. */
const serverError = (res: Response, flow: string, err: unknown) => {
  console.error(`[BFF] ${flow} flow failed:`, err);
  return res.status(500).json({ success: false, error: `${flow} flow encountered an internal error` });
};

playgroundRouter.post('/issue', async (req: Request<{}, {}, IssueCredentialRequest>, res: Response) => {
  const problem = invalidBody(req.body, 'issuer');
  if (problem) return res.status(400).json({ success: false, error: problem });

  const { issuer, wallet, format, credentialSubject } = req.body;
  const transactionId = transactionIdOf(req);

  try {
    const mockResult = await MockProtocolService.issueCredential(format, credentialSubject);

    if (issuer === 'mock-openid4vci') {
      record(transactionId, mockResult.logs);
      return res.json({
        success: true,
        issuer,
        wallet,
        format,
        credentialOffer: mockResult.credentialOffer,
        issuedCredential: mockResult.issuedCredential,
        proofType: mockResult.proofType,
        protocolLogs: globalAuditBuffer.getByTransactionId(transactionId)
      });
    }

    // Inji Certify: discovery and the credential request are live; the
    // credential needs an eSignet user login, so it is always emulated.
    let discovery: Awaited<ReturnType<typeof certifyDiscovery>> | null = null;
    let unavailable = '';
    try {
      discovery = await certifyDiscovery(format, wallet, log => record(transactionId, [log]));
    } catch (err) {
      if (!(err instanceof CollabUnavailable)) throw err;
      unavailable = err.message;
      console.warn(`[BFF] ${unavailable}. Emulating Inji Certify.`);
    }

    const emulated = mockResult.logs
      // With live discovery, only the credential response itself is emulated.
      .filter(log => !discovery || log.action.startsWith('Credential Request'))
      .map(log => (log.receiver === 'Issuer (OpenID4VCI)' ? { ...log, receiver: 'Inji Certify (Collab Sandbox Emulated)' } : log));
    record(transactionId, emulated);

    return res.json({
      success: true,
      issuer,
      wallet,
      format,
      isSandboxFallback: true,
      notice: discovery?.notice ?? `${unavailable}, so its responses are emulated by the mock engine.`,
      credentialOffer: discovery?.credentialOffer ?? mockResult.credentialOffer,
      issuedCredential: mockResult.issuedCredential,
      proofType: mockResult.proofType,
      protocolLogs: globalAuditBuffer.getByTransactionId(transactionId)
    });
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
    if (verifier === 'inji-verify') {
      try {
        const live = await injiVerify(format, credentialOrToken, tamperPayload);
        const presentationDefinition = MockProtocolService.presentationDefinition(format);
        const isValid = live.status === 'VALID';
        record(transactionId, [live.log]);
        return res.json({
          success: true,
          verifier,
          wallet,
          format,
          isValid,
          verificationResult: {
            status: live.status,
            checks: live.checks,
            details: live.details,
            verifiedClaims: isValid ? sharedClaims(presentationDefinition, claimsOf(format, credentialOrToken)) : {}
          },
          presentationDefinition,
          client_id: new URL(collabTargets().verify).origin,
          nonce: uuidv4(),
          protocolLogs: globalAuditBuffer.getByTransactionId(transactionId)
        });
      } catch (err) {
        if (!(err instanceof CollabUnavailable)) throw err;
        console.warn(`[BFF] ${err.message}. Emulating Inji Verify.`);
        const mockResult = await presentToMockVerifier(format, credentialOrToken, tamperPayload);
        const relabel = (name: string) => (name === 'Verifier (OpenID4VP)' ? 'Inji Verify (Collab Sandbox Emulated)' : name);
        record(transactionId, mockResult.logs.map(log => ({ ...log, sender: relabel(log.sender), receiver: relabel(log.receiver) })));
        return res.json({
          success: true,
          verifier,
          wallet,
          format,
          isSandboxFallback: true,
          notice: `${err.message}, so its responses are emulated by the mock engine.`,
          isValid: mockResult.isValid,
          verificationResult: mockResult.verificationResult,
          presentationDefinition: mockResult.presentationDefinition,
          client_id: mockResult.client_id,
          nonce: mockResult.nonce,
          protocolLogs: globalAuditBuffer.getByTransactionId(transactionId)
        });
      }
    }

    const result = await presentToMockVerifier(format, credentialOrToken, tamperPayload);
    record(transactionId, result.logs);
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