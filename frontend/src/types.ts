export type CredentialFormat = 'w3c-vc' | 'sd-jwt';

export type IssuerType = 'inji-certify' | 'mock-openid4vci';
export type WalletType = 'inji-wallet' | 'mock-wallet';
export type VerifierType = 'inji-verify' | 'mock-openid4vp';

export interface ProtocolLog {
  id: string;
  timestamp: string;
  step: number;
  sender: string;
  receiver: string;
  protocol: 'OpenID4VCI' | 'OpenID4VP';
  action: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: any;
  };
  response: {
    status: number;
    headers?: Record<string, string>;
    body?: any;
  };
  durationMs: number;
  tampered?: boolean;
  transactionId?: string;
}

export interface VerificationResult {
  status: 'VALID' | 'INVALID' | 'EXPIRED' | 'SIGNATURE_MISMATCH';
  checks: {
    formatCheck: boolean;
    signatureValid: boolean;
    notExpired: boolean;
    schemaCompliant: boolean;
  };
  details: string;
  verifiedClaims: any;
}

export type NodeRole = 'issuer' | 'wallet' | 'verifier';

export type VerificationStatus = VerificationResult['status'];

/**
 * Lifecycle of a single playground run (issue → hold → present → verify).
 * 'failed' covers both transport errors and negative verification outcomes.
 */
export type RunPhase = 'idle' | 'issuing' | 'issued' | 'verifying' | 'verified' | 'failed';

export interface IssueResponse {
  success: boolean;
  issuer: IssuerType;
  wallet: WalletType;
  format: CredentialFormat;
  credentialOffer?: any;
  issuedCredential: any;
  protocolLogs?: ProtocolLog[];
  isSandboxFallback?: boolean;
  notice?: string;
  error?: string;
}

export interface VerifyResponse {
  success: boolean;
  verifier: VerifierType;
  wallet: WalletType;
  format: CredentialFormat;
  isValid?: boolean;
  verificationResult: VerificationResult;
  presentationDefinition?: any;
  protocolLogs?: ProtocolLog[];
  isSandboxFallback?: boolean;
  notice?: string;
  error?: string;
}

export interface TamperOptions {
  forceExpired: boolean;
  corruptSignature: boolean;
}

export interface CredentialSubjectInput {
  fullName: string;
  dob: string;
  nationalId: string;
  email: string;
  country: string;
}

/** One row of the interoperability report (mandatory task 7). */
export interface RunRecord {
  id: string;
  transactionId: string;
  startedAt: string;
  finishedAt: string;
  issuer: IssuerType;
  wallet: WalletType;
  verifier: VerifierType;
  format: CredentialFormat;
  proofType: string;
  tampered: boolean;
  outcome: 'PASS' | 'FAIL';
  verificationStatus?: VerificationStatus;
  errorDetail?: string;
  sandboxFallback: boolean;
}

/** User-controlled inputs for the next run (lifted so presets can set them). */
export interface RunInputs {
  subject: CredentialSubjectInput;
  tamperMode: boolean;
  tamperOptions: TamperOptions;
}
