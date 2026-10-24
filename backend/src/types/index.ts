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
}

export interface IssueCredentialRequest {
  issuer: IssuerType;
  wallet: WalletType;
  format: CredentialFormat;
  credentialSubject?: {
    fullName: string;
    dob: string;
    nationalId: string;
    email: string;
    country: string;
  };
  tamperPayload?: Record<string, any>;
}

export interface VerifyCredentialRequest {
  verifier: VerifierType;
  wallet: WalletType;
  format: CredentialFormat;
  credentialOrToken?: any;
  tamperPayload?: Record<string, any>;
}
