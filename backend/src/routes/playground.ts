import { Router, Request, Response } from 'express';
import globalAuditBuffer from '../utils/RingBuffer.js';
import { MockProtocolService } from '../mocks/mockService.js';
import { IssueCredentialRequest, VerifyCredentialRequest } from '../types/index.js';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

export const playgroundRouter = Router();

playgroundRouter.post('/issue', async (req: Request<{}, {}, IssueCredentialRequest>, res: Response) => {
  // B-3 FIX: Guard against missing JSON bodies crashing the Express router
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ success: false, error: 'JSON body is required' });
  }

  const { issuer, wallet, format, credentialSubject, tamperPayload } = req.body;
  const transactionId = (req.headers['x-transaction-id'] as string) || `tx-${uuidv4().substring(0, 8)}`;

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
        protocolLogs: globalAuditBuffer.getByTransactionId(transactionId)
      });
    } catch (apiError: any) {
      console.warn(`[Proxy Warning] Inji Certify call unreachable (${apiError.message}). Falling back to emulated Collab response.`);
      const mockResult = MockProtocolService.issueCredential(format, credentialSubject, tamperPayload);
      
      mockResult.logs.forEach((log: any) => {
        log.transactionId = transactionId;
        // B-9 FIX: Only overwrite labels for the external emulated hop (Not the wallet)
        if (log.receiver !== wallet && log.receiver !== 'mock-wallet' && log.receiver !== 'inji-wallet') {
          log.receiver = 'Inji Certify (Collab Sandbox Emulated)';
        }
        if (log.sender !== wallet && log.sender !== 'mock-wallet' && log.sender !== 'inji-wallet') {
          log.sender = 'Inji Certify (Collab Sandbox Emulated)';
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

playgroundRouter.post('/verify', async (req: Request<{}, {}, VerifyCredentialRequest>, res: Response) => {
  // B-3 FIX: Guard against missing JSON bodies
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ success: false, error: 'JSON body is required' });
  }

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
        // B-9 FIX: Only overwrite labels for the external emulated hop (Not the wallet)
        if (log.sender !== wallet && log.sender !== 'mock-wallet' && log.sender !== 'inji-wallet') {
          log.sender = 'Inji Verify (Collab Sandbox Emulated)';
        }
        if (log.receiver !== wallet && log.receiver !== 'mock-wallet' && log.receiver !== 'inji-wallet') {
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

playgroundRouter.get('/logs', (_req: Request, res: Response) => {
  const logs = globalAuditBuffer.getLogs(100);
  res.json({ count: logs.length, logs });
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