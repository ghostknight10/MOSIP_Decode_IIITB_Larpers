import {
  CredentialFormat,
  CredentialSubjectInput,
  IssueResponse,
  IssuerType,
  ProtocolLog,
  TamperOptions,
  VerifierType,
  VerifyResponse,
  WalletType
} from '../types';

/**
 * Typed client for the Playground BFF (/api/playground).
 * Every call in a run carries the same x-transaction-id so the BFF audit
 * logger groups its frames and the inspector can filter by run.
 */

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

// crypto.randomUUID is only available in secure contexts, and the UI is often
// opened over a LAN IP for phone/QR testing, so fall back to Math.random.
export const newTransactionId = () =>
  `tx-${Math.random().toString(16).slice(2, 10).padEnd(8, '0')}`;

async function request<T>(path: string, init: RequestInit = {}, transactionId?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(transactionId ? { 'x-transaction-id': transactionId } : {}),
        ...init.headers
      }
    });
  } catch {
    throw new ApiError('Cannot reach the Playground BFF. Is the backend running on :4000?');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success === false) {
    throw new ApiError(data?.error || `Request to ${path} failed with HTTP ${res.status}`, res.status);
  }
  return data as T;
}

export interface IssueParams {
  issuer: IssuerType;
  wallet: WalletType;
  format: CredentialFormat;
  credentialSubject: CredentialSubjectInput;
  tamperPayload?: TamperOptions;
}

export interface VerifyParams {
  verifier: VerifierType;
  wallet: WalletType;
  format: CredentialFormat;
  credentialOrToken: any;
  tamperPayload?: TamperOptions;
}

export const api = {
  health: () => request<{ status: string }>('/api/health'),

  issue: (params: IssueParams, transactionId: string) =>
    request<IssueResponse>('/api/playground/issue', { method: 'POST', body: JSON.stringify(params) }, transactionId),

  verify: (params: VerifyParams, transactionId: string) =>
    request<VerifyResponse>('/api/playground/verify', { method: 'POST', body: JSON.stringify(params) }, transactionId),

  getLogs: () => request<{ count: number; logs: ProtocolLog[] }>('/api/playground/logs'),

  clearLogs: () => request<{ success: boolean }>('/api/playground/logs', { method: 'DELETE' })
};
