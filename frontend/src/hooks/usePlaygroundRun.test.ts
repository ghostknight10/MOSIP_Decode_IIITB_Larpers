import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, newTransactionId } from '../api/client';
import { DEFAULT_SUBJECT } from '../config/nodes';
import { ProtocolLog, RunRecord, VerificationResult } from '../types';
import { getProofType, mergeLogs, Selection, usePlaygroundRun } from './usePlaygroundRun';

vi.mock('../api/client', () => ({
  api: { issue: vi.fn(), verify: vi.fn(), clearLogs: vi.fn(), health: vi.fn(), getLogs: vi.fn(), streamLogs: vi.fn() },
  newTransactionId: vi.fn()
}));

const issueMock = vi.mocked(api.issue);
const verifyMock = vi.mocked(api.verify);
const clearLogsMock = vi.mocked(api.clearLogs);
const streamLogsMock = vi.mocked(api.streamLogs);

const log = (txId: string, step: number): ProtocolLog => ({
  id: `${txId}-${step}`,
  transactionId: txId,
  timestamp: new Date(2026, 0, 1, 0, 0, step).toISOString(),
  step,
  sender: 'Wallet',
  receiver: 'Issuer',
  protocol: step <= 2 ? 'OpenID4VCI' : 'OpenID4VP',
  action: `step ${step}`,
  status: 'SUCCESS',
  request: { method: 'GET', url: 'https://x' },
  response: { status: 200 },
  durationMs: 1
});

const W3C_VC = { type: ['VerifiableCredential'], proof: { type: 'Ed25519Signature2020' } };

const result = (status: VerificationResult['status'], details = `${status} details`): VerificationResult => ({
  status,
  checks: { formatCheck: true, signatureValid: status !== 'SIGNATURE_MISMATCH', notExpired: status !== 'EXPIRED', schemaCompliant: true },
  details,
  verifiedClaims: {}
});

const issueOk = (txId: string, extra: object = {}) => ({
  success: true,
  issuer: 'inji-certify' as const,
  wallet: 'inji-wallet' as const,
  format: 'w3c-vc' as const,
  credentialOffer: { credential_issuer: 'https://issuer' },
  issuedCredential: W3C_VC,
  protocolLogs: [log(txId, 1), log(txId, 2)],
  ...extra
});

const verifyOk = (txId: string, status: VerificationResult['status'] = 'VALID', extra: object = {}) => ({
  success: true,
  verifier: 'inji-verify' as const,
  wallet: 'inji-wallet' as const,
  format: 'w3c-vc' as const,
  verificationResult: result(status),
  presentationDefinition: { id: 'pd-1' },
  // The BFF returns the whole transaction, issuance frames included.
  protocolLogs: [log(txId, 1), log(txId, 2), log(txId, 3), log(txId, 4)],
  ...extra
});

let txCounter = 0;
beforeEach(() => {
  txCounter = 0;
  vi.mocked(newTransactionId).mockReset().mockImplementation(() => `tx-${String(++txCounter).padStart(8, '0')}`);
  issueMock.mockReset().mockImplementation(async (_p, txId) => issueOk(txId));
  verifyMock.mockReset().mockImplementation(async (_p, txId) => verifyOk(txId));
  clearLogsMock.mockReset().mockResolvedValue({ success: true });
});

const setup = () => renderHook(() => usePlaygroundRun());

describe('initial state', () => {
  it('starts idle with the all-Inji W3C selection', () => {
    const { result: h } = setup();
    expect(h.current.phase).toBe('idle');
    expect(h.current.busy).toBe(false);
    expect(h.current.selection).toEqual({ issuer: 'inji-certify', wallet: 'inji-wallet', verifier: 'inji-verify', format: 'w3c-vc' });
    expect(h.current.logs).toEqual([]);
    expect(h.current.history).toEqual([]);
  });

  it('loads saved history from localStorage', () => {
    const saved = [{ id: 'r1', outcome: 'PASS' }] as RunRecord[];
    localStorage.setItem('mosip-playground-runs', JSON.stringify(saved));
    expect(setup().result.current.history).toEqual(saved);
  });

  it('ignores corrupt saved history', () => {
    localStorage.setItem('mosip-playground-runs', '{not json');
    expect(setup().result.current.history).toEqual([]);
  });
});

describe('issue', () => {
  it('stores offer, credential and newest-first logs on success', async () => {
    const { result: h } = setup();
    await act(() => h.current.issue(DEFAULT_SUBJECT));

    expect(h.current.phase).toBe('issued');
    expect(h.current.transactionId).toBe('tx-00000001');
    expect(h.current.credentialOffer).toEqual({ credential_issuer: 'https://issuer' });
    expect(h.current.issuedCredential).toEqual(W3C_VC);
    expect(h.current.logs.map(l => l.step)).toEqual([2, 1]);
    expect(h.current.history).toEqual([]);
  });

  it('sends the selection and subject without tamper flags', async () => {
    const { result: h } = setup();
    await act(() => h.current.issue(DEFAULT_SUBJECT));
    expect(issueMock).toHaveBeenCalledWith(
      { issuer: 'inji-certify', wallet: 'inji-wallet', format: 'w3c-vc', credentialSubject: DEFAULT_SUBJECT },
      'tx-00000001'
    );
  });

  it('is busy while the request is in flight', async () => {
    let resolve!: (v: any) => void;
    issueMock.mockImplementation(() => new Promise(r => (resolve = r)));
    const { result: h } = setup();
    let pending!: Promise<unknown>;
    act(() => {
      pending = h.current.issue(DEFAULT_SUBJECT);
    });
    expect(h.current.phase).toBe('issuing');
    expect(h.current.busy).toBe(true);
    await act(async () => {
      resolve(issueOk('tx-00000001'));
      await pending;
    });
    expect(h.current.busy).toBe(false);
  });

  it('flags sandbox fallback and keeps the notice', async () => {
    issueMock.mockImplementation(async (_p, txId) => issueOk(txId, { isSandboxFallback: true, notice: 'emulated' }));
    const { result: h } = setup();
    await act(() => h.current.issue(DEFAULT_SUBJECT));
    expect(h.current.sandboxFallback).toBe(true);
    expect(h.current.notices).toEqual(['emulated']);
  });

  it('records a FAIL run and shows the error when issuance fails', async () => {
    issueMock.mockRejectedValue(new Error('issuer down'));
    const { result: h } = setup();
    let returned: unknown;
    await act(async () => {
      returned = await h.current.issue(DEFAULT_SUBJECT);
    });

    expect(returned).toBeNull();
    expect(h.current.phase).toBe('failed');
    expect(h.current.error).toBe('issuer down');
    expect(h.current.history).toHaveLength(1);
    expect(h.current.history[0]).toMatchObject({ outcome: 'FAIL', errorDetail: 'Issuance failed: issuer down', proofType: 'unknown' });
  });
});

describe('verify', () => {
  const issueThenVerify = async (status: VerificationResult['status'], tamper?: { forceExpired: boolean; corruptSignature: boolean }) => {
    verifyMock.mockImplementation(async (_p, txId) => verifyOk(txId, status));
    const hook = setup();
    await act(() => hook.result.current.issue(DEFAULT_SUBJECT));
    await act(() => hook.result.current.verify(tamper));
    return hook.result;
  };

  it('marks a clean VALID run as verified and PASS', async () => {
    const h = await issueThenVerify('VALID');
    expect(h.current.phase).toBe('verified');
    expect(h.current.presentationDefinition).toEqual({ id: 'pd-1' });
    expect(h.current.history[0]).toMatchObject({
      outcome: 'PASS',
      tampered: false,
      verificationStatus: 'VALID',
      proofType: 'Ed25519Signature2020',
      transactionId: 'tx-00000001',
      issuer: 'inji-certify',
      verifier: 'inji-verify',
      format: 'w3c-vc'
    });
    expect(h.current.history[0].errorDetail).toBeUndefined();
  });

  it('reuses the issuance transaction id and passes tamper flags through', async () => {
    const tamper = { forceExpired: true, corruptSignature: false };
    await issueThenVerify('EXPIRED', tamper);
    expect(verifyMock).toHaveBeenCalledWith(
      { verifier: 'inji-verify', wallet: 'inji-wallet', format: 'w3c-vc', credentialOrToken: W3C_VC, tamperPayload: tamper },
      'tx-00000001'
    );
  });

  it('replaces the transaction logs instead of duplicating them', async () => {
    const h = await issueThenVerify('VALID');
    expect(h.current.logs.map(l => l.step)).toEqual([4, 3, 2, 1]);
  });

  it('records which verifier checks failed', async () => {
    const h = await issueThenVerify('EXPIRED', { forceExpired: true, corruptSignature: false });
    expect(h.current.history[0].failedChecks).toEqual(['notExpired']);
  });

  it('records no failed checks for a clean pass', async () => {
    const h = await issueThenVerify('VALID');
    expect(h.current.history[0].failedChecks).toEqual([]);
  });

  it('counts a tampered credential the verifier rejects as PASS', async () => {
    const h = await issueThenVerify('SIGNATURE_MISMATCH', { forceExpired: false, corruptSignature: true });
    expect(h.current.phase).toBe('failed');
    expect(h.current.history[0]).toMatchObject({ outcome: 'PASS', tampered: true, verificationStatus: 'SIGNATURE_MISMATCH' });
  });

  it('counts a tampered credential the verifier accepts as FAIL', async () => {
    const h = await issueThenVerify('VALID', { forceExpired: true, corruptSignature: false });
    expect(h.current.history[0]).toMatchObject({ outcome: 'FAIL', tampered: true, errorDetail: 'VALID details' });
  });

  it('does not treat all-false tamper options as tampering', async () => {
    const h = await issueThenVerify('VALID', { forceExpired: false, corruptSignature: false });
    expect(h.current.history[0]).toMatchObject({ outcome: 'PASS', tampered: false });
  });

  it('counts a clean credential the verifier rejects as FAIL with its details', async () => {
    const h = await issueThenVerify('INVALID');
    expect(h.current.history[0]).toMatchObject({ outcome: 'FAIL', errorDetail: 'INVALID details' });
  });

  it('records a transport failure during verification', async () => {
    verifyMock.mockRejectedValue(new Error('verifier timeout'));
    const { result: h } = setup();
    await act(() => h.current.issue(DEFAULT_SUBJECT));
    await act(() => h.current.verify());
    expect(h.current.phase).toBe('failed');
    expect(h.current.error).toBe('verifier timeout');
    expect(h.current.history[0]).toMatchObject({ outcome: 'FAIL', errorDetail: 'Verification failed: verifier timeout' });
  });

  it('keeps the fallback flag if either phase was emulated', async () => {
    verifyMock.mockImplementation(async (_p, txId) => verifyOk(txId, 'VALID', { isSandboxFallback: true, notice: 'verify emulated' }));
    const { result: h } = setup();
    await act(() => h.current.issue(DEFAULT_SUBJECT));
    await act(() => h.current.verify());
    expect(h.current.sandboxFallback).toBe(true);
    expect(h.current.notices).toEqual(['verify emulated']);
    expect(h.current.history[0].sandboxFallback).toBe(true);
  });

  it('tracks which phase was emulated', async () => {
    issueMock.mockImplementation(async (_p, txId) => issueOk(txId, { isSandboxFallback: true }));
    const { result: h } = setup();
    await act(() => h.current.issue(DEFAULT_SUBJECT));
    expect([h.current.issueFallback, h.current.verifyFallback]).toEqual([true, false]);
    await act(() => h.current.verify());
    expect([h.current.issueFallback, h.current.verifyFallback, h.current.sandboxFallback]).toEqual([true, false, true]);
  });

  it('drops the verify fallback when re-presenting to another verifier', async () => {
    verifyMock
      .mockImplementationOnce(async (_p, txId) => verifyOk(txId, 'VALID', { isSandboxFallback: true }))
      .mockImplementationOnce(async (_p, txId) => verifyOk(txId, 'VALID'));
    const { result: h } = setup();
    await act(() => h.current.issue(DEFAULT_SUBJECT));
    await act(() => h.current.verify());
    expect(h.current.verifyFallback).toBe(true);

    act(() => h.current.select({ verifier: 'mock-openid4vp' }));
    expect([h.current.verifyFallback, h.current.sandboxFallback]).toEqual([false, false]);
    await act(() => h.current.verify());
    expect(h.current.history.map(r => r.sandboxFallback)).toEqual([false, true]);
  });
});

describe('select', () => {
  it('updates the selection and resets an in-progress run', async () => {
    const { result: h } = setup();
    await act(() => h.current.issue(DEFAULT_SUBJECT));
    act(() => h.current.select({ issuer: 'mock-openid4vci' }));
    expect(h.current.selection.issuer).toBe('mock-openid4vci');
    expect(h.current.phase).toBe('idle');
    expect(h.current.issuedCredential).toBeNull();
  });

  it.each([{ wallet: 'mock-wallet' }, { format: 'sd-jwt' }] as Partial<Selection>[])('resets the run when %o changes', async patch => {
    const { result: h } = setup();
    await act(() => h.current.issue(DEFAULT_SUBJECT));
    act(() => h.current.select(patch));
    expect(h.current.issuedCredential).toBeNull();
  });

  it('keeps the held credential when only the verifier changes', async () => {
    const { result: h } = setup();
    await act(() => h.current.issue(DEFAULT_SUBJECT));
    await act(() => h.current.verify());
    act(() => h.current.select({ verifier: 'mock-openid4vp' }));
    expect(h.current.phase).toBe('issued');
    expect(h.current.issuedCredential).toEqual(W3C_VC);
    expect(h.current.verificationResult).toBeNull();
    expect(h.current.transactionId).toBe('tx-00000001');
  });

  it('ignores selection changes while a phase is running', () => {
    issueMock.mockImplementation(() => new Promise(() => {}));
    const { result: h } = setup();
    act(() => {
      h.current.issue(DEFAULT_SUBJECT);
    });
    act(() => h.current.select({ issuer: 'mock-openid4vci' }));
    expect(h.current.selection.issuer).toBe('inji-certify');
  });

  it('keeps logs and history when the run resets', async () => {
    const { result: h } = setup();
    await act(() => h.current.issue(DEFAULT_SUBJECT));
    await act(() => h.current.verify());
    act(() => h.current.select({ format: 'sd-jwt' }));
    expect(h.current.logs).toHaveLength(4);
    expect(h.current.history).toHaveLength(1);
  });
});

describe('runFullFlow and runBatch', () => {
  it('issues then verifies the freshly issued credential', async () => {
    const { result: h } = setup();
    const tamper = { forceExpired: false, corruptSignature: true };
    await act(() => h.current.runFullFlow(DEFAULT_SUBJECT, tamper));
    expect(issueMock).toHaveBeenCalledTimes(1);
    expect(verifyMock).toHaveBeenCalledWith(expect.objectContaining({ credentialOrToken: W3C_VC, tamperPayload: tamper }), 'tx-00000001');
    expect(h.current.history).toHaveLength(1);
  });

  it('uses proof type and presentation request metadata returned by the BFF', async () => {
    issueMock.mockImplementation(async (_p, txId) => issueOk(txId, { proofType: 'IssuerProofType' }));
    verifyMock.mockImplementation(async (_p, txId) => verifyOk(txId, 'VALID', {
      client_id: 'https://verify.mock.mosip.net',
      nonce: 'server-generated-nonce'
    }));
    const { result: h } = setup();

    await act(() => h.current.runFullFlow(DEFAULT_SUBJECT));

    expect(h.current.history[0].proofType).toBe('IssuerProofType');
    expect(h.current.presentationRequest).toEqual({
      clientId: 'https://verify.mock.mosip.net',
      nonce: 'server-generated-nonce'
    });
  });

  it('runs an explicit combination without changing the stored selection', async () => {
    const { result: h } = setup();
    const sel: Selection = { issuer: 'mock-openid4vci', wallet: 'mock-wallet', verifier: 'mock-openid4vp', format: 'sd-jwt' };
    await act(() => h.current.runFullFlow(DEFAULT_SUBJECT, undefined, sel));
    expect(issueMock.mock.calls[0][0]).toMatchObject({ issuer: 'mock-openid4vci', wallet: 'mock-wallet', format: 'sd-jwt' });
    expect(verifyMock.mock.calls[0][0]).toMatchObject({ verifier: 'mock-openid4vp', format: 'sd-jwt' });
    expect(h.current.history[0]).toMatchObject(sel);
  });

  it('skips verification when issuance fails', async () => {
    issueMock.mockRejectedValue(new Error('nope'));
    const { result: h } = setup();
    await act(() => h.current.runFullFlow(DEFAULT_SUBJECT));
    expect(verifyMock).not.toHaveBeenCalled();
    expect(h.current.history).toHaveLength(1);
  });

  it('runs every combination in order, reporting progress', async () => {
    const combos: Selection[] = [
      { issuer: 'inji-certify', wallet: 'inji-wallet', verifier: 'inji-verify', format: 'w3c-vc' },
      { issuer: 'mock-openid4vci', wallet: 'mock-wallet', verifier: 'mock-openid4vp', format: 'sd-jwt' }
    ];
    const progress = vi.fn();
    const { result: h } = setup();
    await act(() => h.current.runBatch(combos, DEFAULT_SUBJECT, progress));

    expect(progress.mock.calls).toEqual([[1, 2], [2, 2]]);
    expect(h.current.history.map(r => r.issuer)).toEqual(['mock-openid4vci', 'inji-certify']);
    expect(new Set(h.current.history.map(r => r.transactionId)).size).toBe(2);
    expect(h.current.selection).toEqual(combos[1]);
  });
});

describe('history, logs and reset', () => {
  it('persists history to localStorage', async () => {
    const { result: h } = setup();
    await act(() => h.current.runFullFlow(DEFAULT_SUBJECT));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('mosip-playground-runs')!)).toHaveLength(1));
  });

  it('caps history at 200 runs, keeping the newest', async () => {
    const old = Array.from({ length: 200 }, (_, i) => ({ id: `old-${i}` })) as RunRecord[];
    localStorage.setItem('mosip-playground-runs', JSON.stringify(old));
    const { result: h } = setup();
    await act(() => h.current.runFullFlow(DEFAULT_SUBJECT));
    expect(h.current.history).toHaveLength(200);
    expect(h.current.history[0].transactionId).toBe('tx-00000001');
    expect(h.current.history.at(-1)!.id).toBe('old-198');
  });

  it('clearHistory empties history', async () => {
    const { result: h } = setup();
    await act(() => h.current.runFullFlow(DEFAULT_SUBJECT));
    act(() => h.current.clearHistory());
    expect(h.current.history).toEqual([]);
  });

  it('clearLogs clears the BFF buffer and the UI', async () => {
    const { result: h } = setup();
    await act(() => h.current.issue(DEFAULT_SUBJECT));
    await act(() => h.current.clearLogs());
    expect(clearLogsMock).toHaveBeenCalled();
    expect(h.current.logs).toEqual([]);
  });

  it('clearLogs still clears the UI when the BFF call fails', async () => {
    clearLogsMock.mockRejectedValue(new Error('offline'));
    const { result: h } = setup();
    await act(() => h.current.issue(DEFAULT_SUBJECT));
    await act(() => h.current.clearLogs());
    expect(h.current.logs).toEqual([]);
  });

  it('reset returns to idle but keeps the selection', async () => {
    const { result: h } = setup();
    act(() => h.current.select({ format: 'sd-jwt' }));
    await act(() => h.current.issue(DEFAULT_SUBJECT));
    act(() => h.current.reset());
    expect(h.current.phase).toBe('idle');
    expect(h.current.issuedCredential).toBeNull();
    expect(h.current.selection.format).toBe('sd-jwt');
  });
});

describe('getProofType', () => {
  it('reads the LD proof type for W3C credentials', () => {
    expect(getProofType(W3C_VC, 'w3c-vc')).toBe('Ed25519Signature2020');
  });

  it('names the COSE signature for mDoc credentials', () => {
    expect(getProofType({ decoded: { alg: 'ES256' } }, 'mso-mdoc')).toBe('COSE_Sign1 (ES256)');
  });

  it('reads the JWT alg for SD-JWT credentials', () => {
    expect(getProofType({ decoded: { header: { alg: 'ES256' } } }, 'sd-jwt')).toBe('JWT (ES256)');
    expect(getProofType({ rawToken: 'a.b.c' }, 'sd-jwt')).toBe('JWT');
  });

  it('returns unknown when nothing is available', () => {
    expect(getProofType(null, 'w3c-vc')).toBe('unknown');
    expect(getProofType({}, 'w3c-vc')).toBe('unknown');
  });
});

describe('mergeLogs', () => {
  it('returns existing logs when nothing new arrives', () => {
    const existing = [log('a', 1)];
    expect(mergeLogs(existing, undefined, 'a')).toBe(existing);
    expect(mergeLogs(existing, [], 'a')).toBe(existing);
  });

  it('puts the transaction newest-first ahead of other transactions', () => {
    const merged = mergeLogs([log('b', 2), log('b', 1), log('a', 1)], [log('a', 1), log('a', 2)], 'a');
    expect(merged.map(l => l.id)).toEqual(['a-2', 'a-1', 'b-2', 'b-1']);
  });

  it('does not mutate the incoming array', () => {
    const incoming = [log('a', 1), log('a', 2)];
    mergeLogs([], incoming, 'a');
    expect(incoming.map(l => l.step)).toEqual([1, 2]);
  });
});

describe('live log stream', () => {
  const subscribe = () => {
    let onLog: (log: ProtocolLog) => void = () => {};
    const unsubscribe = vi.fn();
    streamLogsMock.mockReset().mockImplementation(cb => {
      onLog = cb;
      return unsubscribe;
    });
    return { push: (l: ProtocolLog) => act(() => onLog(l)), unsubscribe };
  };

  it('shows frames of the run in flight before its response arrives', async () => {
    const stream = subscribe();
    let respond: (value: ReturnType<typeof issueOk>) => void = () => {};
    issueMock.mockImplementation((_p, txId) => new Promise(r => (respond = () => r(issueOk(txId)))));
    const { result: h } = setup();

    let pending: Promise<unknown>;
    act(() => {
      pending = h.current.issue(DEFAULT_SUBJECT);
    });
    const tx = h.current.transactionId!;
    stream.push(log(tx, 1));
    stream.push(log(tx, 1)); // duplicate
    stream.push(log('tx-other', 1)); // another run
    expect(h.current.logs.map(l => l.id)).toEqual([`${tx}-1`]);

    await act(async () => {
      respond(issueOk(tx));
      await pending;
    });
    expect(h.current.logs.map(l => l.id)).toEqual([`${tx}-2`, `${tx}-1`]);
  });

  it('ignores frames while no run is in flight', () => {
    const stream = subscribe();
    const { result: h } = setup();
    stream.push(log('tx-00000001', 1));
    expect(h.current.logs).toEqual([]);
  });

  it('unsubscribes on unmount', () => {
    const stream = subscribe();
    const { unmount } = setup();
    unmount();
    expect(stream.unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('importCredential', () => {
  const b64 = (v: unknown) => btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const token = `${b64({ alg: 'ES256', typ: 'vc+sd-jwt' })}.${b64({ iss: 'https://issuer' })}.sig~${b64(['s', 'UIN', '42'])}~`;

  it('holds the credential, switches the format and flags the recorded run', async () => {
    const { result: h } = setup();
    let error: string | null = 'unset';
    act(() => {
      error = h.current.importCredential(token);
    });
    expect(error).toBeNull();
    expect(h.current).toMatchObject({ phase: 'issued', imported: true, credentialOffer: null, issueFallback: false });
    expect(h.current.selection.format).toBe('sd-jwt');
    expect(h.current.issuedCredential.rawToken).toBe(token);
    expect(issueMock).not.toHaveBeenCalled();

    await act(() => h.current.verify());
    expect(verifyMock.mock.calls[0][0]).toMatchObject({ format: 'sd-jwt', credentialOrToken: { rawToken: token } });
    expect(h.current.history[0]).toMatchObject({ imported: true, proofType: 'JWT (ES256)' });
  });

  it('returns the parse error and changes nothing', () => {
    const { result: h } = setup();
    let error: string | null = null;
    act(() => {
      error = h.current.importCredential('nope');
    });
    expect(error).toContain('Not a W3C credential');
    expect(h.current.phase).toBe('idle');
  });

  it('issuing again clears the imported flag', async () => {
    const { result: h } = setup();
    act(() => {
      h.current.importCredential(token);
    });
    await act(() => h.current.issue(DEFAULT_SUBJECT));
    expect(h.current.imported).toBe(false);
  });
});
