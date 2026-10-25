import { useCallback, useEffect, useReducer, useRef } from 'react';
import { api, newTransactionId } from '../api/client';
import { parseImportedCredential } from '../lib/importCredential';
import {
  CredentialFormat,
  CredentialSubjectInput,
  IssuerType,
  ProtocolLog,
  RunPhase,
  RunRecord,
  TamperOptions,
  VerificationResult,
  VerifierType,
  WalletType
} from '../types';

/**
 * Single source of truth for the playground run: matrix selection, flow phase,
 * payloads, logs and run history. Components only render this state and call
 * the returned actions.
 */

const HISTORY_KEY = 'mosip-playground-runs';
const HISTORY_LIMIT = 200;

export interface Selection {
  issuer: IssuerType;
  wallet: WalletType;
  verifier: VerifierType;
  format: CredentialFormat;
}

interface PlaygroundState {
  selection: Selection;
  phase: RunPhase;
  transactionId: string | null;
  startedAt: string | null;
  credentialOffer: any;
  credentialOfferUri: string | null;
  issuedCredential: any;
  issuedProofType: string | null;
  presentationDefinition: any;
  presentationDefinitionUri: string | null;
  presentationRequest: { clientId: string; nonce: string } | null;
  verificationResult: VerificationResult | null;
  /** Inji Certify / Inji Verify answered from the emulated sandbox in this run. */
  issueFallback: boolean;
  /** Which Collab component builds runs talk to; stamped on each run record. */
  components: string | null;
  /** The wallet holds a credential imported from outside the playground (not issued in this run). */
  imported: boolean;
  verifyFallback: boolean;
  /** issueFallback || verifyFallback */
  sandboxFallback: boolean;
  notices: string[];
  error: string | null;
  logs: ProtocolLog[];
  history: RunRecord[];
}

type Action =
  | { type: 'select'; patch: Partial<Selection> }
  | { type: 'issueStart'; transactionId: string }
  | { type: 'issueDone'; credentialOffer: any; credentialOfferUri?: string; issuedCredential: any; proofType?: string; logs?: ProtocolLog[]; fallback?: boolean; notice?: string; imported?: boolean }
  | { type: 'verifyStart' }
  | { type: 'verifyDone'; verificationResult: VerificationResult; presentationDefinition: any; presentationDefinitionUri?: string; client_id?: string; nonce?: string; logs?: ProtocolLog[]; fallback?: boolean; notice?: string }
  | { type: 'streamed'; log: ProtocolLog }
  | { type: 'components'; label: string }
  | { type: 'fail'; error: string }
  | { type: 'record'; record: RunRecord }
  | { type: 'clearLogs' }
  | { type: 'clearHistory' }
  | { type: 'reset' };

const emptyRun = {
  phase: 'idle' as RunPhase,
  transactionId: null,
  startedAt: null,
  credentialOffer: null,
  credentialOfferUri: null,
  issuedCredential: null,
  issuedProofType: null,
  presentationDefinition: null,
  presentationDefinitionUri: null,
  presentationRequest: null,
  verificationResult: null,
  issueFallback: false,
  imported: false,
  verifyFallback: false,
  sandboxFallback: false,
  notices: [],
  error: null
};

const loadHistory = (): RunRecord[] => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
};

/**
 * Logs are kept newest-first (the inspector lists them that way and the
 * sequence diagram reverses them). The BFF returns every frame for the
 * transaction oldest-first, so replace that transaction's frames rather than
 * appending, and flip their order.
 */
export const mergeLogs = (existing: ProtocolLog[], incoming: ProtocolLog[] | undefined, txId: string | null) => {
  if (!incoming?.length) return existing;
  const tagged = txId ? incoming.map(l => (l.transactionId ? l : { ...l, transactionId: txId })) : incoming;
  return [...tagged].reverse().concat(existing.filter(l => l.transactionId !== txId));
};

const isBusy = (phase: RunPhase) => phase === 'issuing' || phase === 'verifying';

function reducer(state: PlaygroundState, action: Action): PlaygroundState {
  switch (action.type) {
    case 'select': {
      if (isBusy(state.phase)) return state;
      const selection = { ...state.selection, ...action.patch };
      // A new verifier can re-verify the credential already held by the wallet;
      // any other change invalidates it.
      const onlyVerifierChanged = Object.keys(action.patch).every(k => k === 'verifier');
      if (onlyVerifierChanged && state.issuedCredential) {
        return {
          ...state,
          selection,
          phase: 'issued',
          verificationResult: null,
          presentationDefinition: null,
          presentationDefinitionUri: null,
          presentationRequest: null,
          error: null,
          verifyFallback: false,
          sandboxFallback: state.issueFallback
        };
      }
      return { ...state, ...emptyRun, selection };
    }
    case 'issueStart':
      return { ...state, ...emptyRun, phase: 'issuing', transactionId: action.transactionId, startedAt: new Date().toISOString() };
    case 'issueDone':
      return {
        ...state,
        phase: 'issued',
        credentialOffer: action.credentialOffer ?? null,
        credentialOfferUri: action.credentialOfferUri ?? null,
        issuedCredential: action.issuedCredential,
        issuedProofType: action.proofType ?? null,
        imported: Boolean(action.imported),
        issueFallback: Boolean(action.fallback),
        verifyFallback: false,
        sandboxFallback: Boolean(action.fallback),
        notices: action.notice ? [action.notice] : [],
        logs: mergeLogs(state.logs, action.logs, state.transactionId)
      };
    case 'verifyStart':
      return { ...state, phase: 'verifying', verificationResult: null, error: null };
    case 'verifyDone':
      return {
        ...state,
        phase: action.verificationResult.status === 'VALID' ? 'verified' : 'failed',
        verificationResult: action.verificationResult,
        presentationDefinition: action.presentationDefinition ?? null,
        presentationDefinitionUri: action.presentationDefinitionUri ?? null,
        presentationRequest: action.client_id && action.nonce
          ? { clientId: action.client_id, nonce: action.nonce }
          : null,
        verifyFallback: Boolean(action.fallback),
        sandboxFallback: state.issueFallback || Boolean(action.fallback),
        notices: action.notice ? [...state.notices, action.notice] : state.notices,
        logs: mergeLogs(state.logs, action.logs, state.transactionId)
      };
    case 'components':
      return { ...state, components: action.label };
    case 'streamed':
      // A frame of the run in flight, streamed before its response arrives.
      // The response then replaces the transaction's frames (mergeLogs).
      if (!isBusy(state.phase) || action.log.transactionId !== state.transactionId || state.logs.some(l => l.id === action.log.id)) {
        return state;
      }
      return { ...state, logs: [action.log, ...state.logs] };
    case 'fail':
      return { ...state, phase: 'failed', error: action.error };
    case 'record':
      return { ...state, history: [action.record, ...state.history].slice(0, HISTORY_LIMIT) };
    case 'clearLogs':
      return { ...state, logs: [] };
    case 'clearHistory':
      return { ...state, history: [] };
    case 'reset':
      return { ...state, ...emptyRun };
  }
}

/** Best-effort proof type label from either credential shape the BFF returns. */
export const getProofType = (credential: any, format: CredentialFormat): string => {
  if (!credential) return 'unknown';
  if (format === 'sd-jwt') {
    const alg = credential.decoded?.header?.alg;
    return alg ? `JWT (${alg})` : 'JWT';
  }
  if (format === 'mso-mdoc') return `COSE_Sign1 (${credential.decoded?.alg ?? 'ES256'})`;
  return credential.proof?.type || 'unknown';
};

export function usePlaygroundRun() {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    selection: { issuer: 'inji-certify', wallet: 'inji-wallet', verifier: 'inji-verify', format: 'w3c-vc' },
    ...emptyRun,
    components: null,
    logs: [],
    history: loadHistory()
  }) as PlaygroundState);

  // Fingerprint of the Collab builds, for regression tracking across Inji releases.
  // A ref, so records made by callbacks created earlier still see it.
  const componentsRef = useRef<string | null>(null);
  useEffect(() => {
    // Best effort: a BFF without this endpoint just leaves runs unstamped.
    Promise.resolve()
      .then(() => api.components())
      .then(({ label }) => {
        componentsRef.current = label;
        dispatch({ type: 'components', label });
      })
      .catch(() => {});
  }, []);

  // Live Collab calls take a second or more; show their frames as they happen.
  useEffect(() => api.streamLogs(log => dispatch({ type: 'streamed', log })), []);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
    } catch {
      // Storage unavailable (private mode); history stays in memory.
    }
  }, [state.history]);

  const record = (
    sel: Selection,
    transactionId: string,
    startedAt: string,
    credential: any,
    tamper: TamperOptions | undefined,
    fallback: boolean,
    result?: VerificationResult,
    errorDetail?: string,
    proofType?: string,
    imported = false
  ) => {
    const tampered = Boolean(tamper && Object.values(tamper).some(Boolean));
    // PASS means the verifier behaved as expected: accept a clean credential,
    // reject a tampered one.
    const passed = !errorDetail && !!result && (tampered ? result.status !== 'VALID' : result.status === 'VALID');
    dispatch({
      type: 'record',
      record: {
        id: `${transactionId}-${Date.now()}`,
        transactionId,
        startedAt,
        finishedAt: new Date().toISOString(),
        ...sel,
        proofType: proofType ?? getProofType(credential, sel.format),
        tampered,
        outcome: passed ? 'PASS' : 'FAIL',
        verificationStatus: result?.status,
        failedChecks: result ? (Object.keys(result.checks ?? {}) as (keyof VerificationResult['checks'])[]).filter(k => !result.checks[k]) : undefined,
        errorDetail: errorDetail ?? (passed ? undefined : result?.details),
        sandboxFallback: fallback,
        ...(imported ? { imported: true } : {}),
        ...(componentsRef.current ? { components: componentsRef.current } : {})
      }
    });
  };

  const issue = useCallback(async (subject: CredentialSubjectInput, sel: Selection = state.selection) => {
    const transactionId = newTransactionId();
    const startedAt = new Date().toISOString();
    dispatch({ type: 'issueStart', transactionId });
    try {
      const data = await api.issue({ issuer: sel.issuer, wallet: sel.wallet, format: sel.format, credentialSubject: subject }, transactionId);
      dispatch({
        type: 'issueDone',
        credentialOffer: data.credentialOffer,
        credentialOfferUri: data.credentialOfferUri,
        issuedCredential: data.issuedCredential,
        proofType: data.proofType,
        logs: data.protocolLogs,
        fallback: data.isSandboxFallback,
        notice: data.notice
      });
      return {
        transactionId,
        startedAt,
        credential: data.issuedCredential,
        proofType: data.proofType,
        fallback: Boolean(data.isSandboxFallback),
        imported: false
      };
    } catch (err: any) {
      dispatch({ type: 'fail', error: err.message });
      record(sel, transactionId, startedAt, null, undefined, false, undefined, `Issuance failed: ${err.message}`);
      return null;
    }
  }, [state.selection]);

  const verify = useCallback(async (
    tamper?: TamperOptions,
    run = {
      transactionId: state.transactionId ?? newTransactionId(),
      startedAt: state.startedAt ?? new Date().toISOString(),
      credential: state.issuedCredential,
      proofType: state.issuedProofType ?? undefined,
      // Only issuance carries over: a re-verification decides its own fallback.
      fallback: state.issueFallback,
      imported: state.imported
    },
    sel: Selection = state.selection
  ) => {
    dispatch({ type: 'verifyStart' });
    try {
      const data = await api.verify({
        verifier: sel.verifier,
        wallet: sel.wallet,
        format: sel.format,
        credentialOrToken: run.credential,
        tamperPayload: tamper
      }, run.transactionId);
      dispatch({
        type: 'verifyDone',
        verificationResult: data.verificationResult,
        presentationDefinition: data.presentationDefinition,
        presentationDefinitionUri: data.presentationDefinitionUri,
        client_id: data.client_id,
        nonce: data.nonce,
        logs: data.protocolLogs,
        fallback: data.isSandboxFallback,
        notice: data.notice
      });
      record(
        sel,
        run.transactionId,
        run.startedAt,
        run.credential,
        tamper,
        run.fallback || Boolean(data.isSandboxFallback),
        data.verificationResult,
        undefined,
        run.proofType,
        run.imported
      );
      return data.verificationResult;
    } catch (err: any) {
      dispatch({ type: 'fail', error: err.message });
      record(sel, run.transactionId, run.startedAt, run.credential, tamper, run.fallback, undefined, `Verification failed: ${err.message}`, run.proofType, run.imported);
      return null;
    }
  }, [state.selection, state.transactionId, state.startedAt, state.issuedCredential, state.issuedProofType, state.issueFallback, state.imported]);

  /**
   * Puts a credential obtained outside the playground in the wallet, so it can
   * be presented to either verifier. Switches the format to match. Returns an
   * error message, or null on success.
   */
  const importCredential = useCallback((text: string): string | null => {
    const parsed = parseImportedCredential(text);
    if ('error' in parsed) return parsed.error;
    if (parsed.format !== state.selection.format) dispatch({ type: 'select', patch: { format: parsed.format } });
    dispatch({ type: 'issueStart', transactionId: newTransactionId() });
    dispatch({
      type: 'issueDone',
      credentialOffer: null,
      issuedCredential: parsed.credential,
      proofType: getProofType(parsed.credential, parsed.format),
      imported: true,
      notice: 'The wallet holds an imported credential: it was issued outside the playground, so there are no issuance steps.'
    });
    return null;
  }, [state.selection.format]);

  /** Issue then immediately present & verify, optionally for an explicit matrix combination. */
  const runFullFlow = useCallback(async (subject: CredentialSubjectInput, tamper?: TamperOptions, sel: Selection = state.selection) => {
    const issued = await issue(subject, sel);
    if (!issued) return null;
    return verify(tamper, issued, sel);
  }, [issue, verify, state.selection]);

  /** Run the full flow for each combination in sequence (report "Run all combinations"). */
  const runBatch = useCallback(async (
    combos: Selection[],
    subject: CredentialSubjectInput,
    onProgress?: (done: number, total: number) => void
  ) => {
    for (let i = 0; i < combos.length; i++) {
      dispatch({ type: 'select', patch: combos[i] });
      await runFullFlow(subject, undefined, combos[i]);
      onProgress?.(i + 1, combos.length);
    }
  }, [runFullFlow]);

  const clearLogs = useCallback(async () => {
    try {
      await api.clearLogs();
    } catch {
      // The BFF buffer may survive, but the UI view is cleared either way.
    }
    dispatch({ type: 'clearLogs' });
  }, []);

  return {
    ...state,
    busy: isBusy(state.phase),
    select: (patch: Partial<Selection>) => dispatch({ type: 'select', patch }),
    issue,
    verify,
    runFullFlow,
    runBatch,
    importCredential,
    reset: () => dispatch({ type: 'reset' }),
    clearLogs,
    clearHistory: () => dispatch({ type: 'clearHistory' })
  };
}
