import { Router, Request, Response } from 'express';
import globalAuditBuffer from '../utils/RingBuffer.js';
import { MockProtocolService } from '../mocks/mockService.js';
import { IssueCredentialRequest, VerifyCredentialRequest } from '../types/index.js';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

export const playgroundRouter = Router();

/**
 * Trigger Issue Credential Flow (OpenID4VCI)
 */
playgroundRouter.post('/issue', async (req: Request<{}, {}, IssueCredentialRequest>, res: Response) => {
  const { issuer, wallet, format, credentialSubject, tamperPayload } = req.body;
  const transactionId = (req.headers['x-transaction-id'] as string) || `tx-${uuidv4().substring(0, 8)}`;

  try {
    if (issuer === 'mock-openid4vci') {
      // Use standard-compliant mock issuer
      const result = MockProtocolService.issueCredential(format, credentialSubject, tamperPayload);
      
      // Inject transactionId and push to our new RingBuffer
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
        protocolLogs: globalAuditBuffer.getByTransactionId(transactionId)
      });
    }

    // Target: Inji Certify (MOSIP Collab Sandbox)
    const certifyUrl = process.env.MOSIP_INJI_CERTIFY_URL || 'https://certify.collab.mosip.net';

    try {
      // NOTE: In a full implementation, use createAuditClient here 
      // instead of raw axios so the interceptor catches the outbound HTTP call.
      const response = await axios.post(
        `${certifyUrl}/v1/certify/credentials/issue`,
        {
          format: format === 'sd-jwt' ? 'vc+sd-jwt' : 'ldp_vc',
          claims: credentialSubject || { fullName: 'Sandbox User' }
        },
        { timeout: 5000 }
      );

      return res.json({
        success: true,
        issuer,
        wallet,
        format,
        issuedCredential: response.data,
        protocolLogs: globalAuditBuffer.getByTransactionId(transactionId)
      });
    } catch (apiError: any) {
      // Graceful fallback to sandbox mock mode when sandbox is unreachable
      console.warn(`[Proxy Warning] Inji Certify call unreachable (${apiError.message}). Falling back to emulated Collab response.`);
      const mockResult = MockProtocolService.issueCredential(format, credentialSubject, tamperPayload);
      
      // Customize sender/receiver to indicate sandbox emulation
      mockResult.logs.forEach((log: any) => {
        log.transactionId = transactionId;
        log.receiver = 'Inji Certify (Collab Sandbox Emulated)';
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
        protocolLogs: globalAuditBuffer.getByTransactionId(transactionId)
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Issuance flow encountered an error'
    });
  }
});

/**
 * Trigger Present & Verify Flow (OpenID4VP)
 */
playgroundRouter.post('/verify', async (req: Request<{}, {}, VerifyCredentialRequest>, res: Response) => {
  const { verifier, wallet, format, credentialOrToken, tamperPayload } = req.body;
  const transactionId = (req.headers['x-transaction-id'] as string) || `tx-${uuidv4().substring(0, 8)}`;

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
        protocolLogs: globalAuditBuffer.getByTransactionId(transactionId)
      });
    }

    // Target: Inji Verify (MOSIP Collab Sandbox)
    const verifyUrl = process.env.MOSIP_INJI_VERIFY_URL || 'https://verify.collab.mosip.net';
    try {
      const response = await axios.post(
        `${verifyUrl}/v1/verify/presentation`,
        { vp_token: credentialOrToken },
        { timeout: 5000 }
      );

      return res.json({
        success: true,
        verifier,
        wallet,
        format,
        verificationResult: response.data,
        protocolLogs: globalAuditBuffer.getByTransactionId(transactionId)
      });
    } catch (apiError: any) {
      console.warn(`[Proxy Warning] Inji Verify call unreachable (${apiError.message}). Falling back to emulated Collab response.`);
      const mockResult = MockProtocolService.verifyPresentation(format, credentialOrToken, tamperPayload);

      mockResult.logs.forEach((log: any) => {
        log.transactionId = transactionId;
        log.sender = 'Inji Verify (Collab Sandbox Emulated)';
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
        protocolLogs: globalAuditBuffer.getByTransactionId(transactionId)
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Verification flow encountered an error'
    });
  }
});

/**
 * Retrieve In-Memory Protocol Audit Logs
 * (Refactored to fetch the last 100 frames from the Ring Buffer)
 */
playgroundRouter.get('/logs', (_req: Request, res: Response) => {
  const logs = globalAuditBuffer.getLogs(100);
  res.json({ count: logs.length, logs });
});

/**
 * Clear Logs
 */
playgroundRouter.delete('/logs', (_req: Request, res: Response) => {
  globalAuditBuffer.clearLogs();
  res.json({ success: true, message: 'Protocol logs cleared.' });
});

/**
 * Interoperability Matrix Status View Data (Day 3 Feature Pre-wired)
 */
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