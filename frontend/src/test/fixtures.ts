import { ProtocolLog, RunRecord } from '../types';

let seq = 0;

/** A RunRecord with sensible defaults; override any field. */
export const makeRun = (overrides: Partial<RunRecord> = {}): RunRecord => {
  seq++;
  return {
    id: `run-${seq}`,
    transactionId: `tx-${String(seq).padStart(8, '0')}`,
    startedAt: '2026-10-24T10:00:00.000Z',
    finishedAt: '2026-10-24T10:00:01.000Z',
    issuer: 'inji-certify',
    wallet: 'inji-wallet',
    verifier: 'inji-verify',
    format: 'w3c-vc',
    proofType: 'Ed25519Signature2020',
    tampered: false,
    outcome: 'PASS',
    verificationStatus: 'VALID',
    sandboxFallback: false,
    ...overrides
  };
};

export const makeLog = (overrides: Partial<ProtocolLog> = {}): ProtocolLog => ({
  id: `log-${++seq}`,
  timestamp: '2026-10-24T10:00:00.000Z',
  step: 1,
  sender: 'Wallet',
  receiver: 'Issuer (OpenID4VCI)',
  protocol: 'OpenID4VCI',
  action: 'Fetch Credential Offer',
  status: 'SUCCESS',
  request: { method: 'GET', url: 'https://issuer.mock.mosip.net/.well-known/openid-credential-issuer' },
  response: { status: 200, body: { credential_issuer: 'https://issuer.mock.mosip.net' } },
  durationMs: 42,
  ...overrides
});
