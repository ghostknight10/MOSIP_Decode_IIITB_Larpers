import React from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { RunPhase, VerificationResult, VerifierType } from '../../types';
import { getNode } from '../../config/nodes';
import { buildVpRequestUri } from '../../lib/credential';
import { QrPanel } from './QrPanel';
import { VerdictCard } from './VerdictCard';

interface PresentPhaseProps {
  phase: RunPhase;
  verifier: VerifierType;
  transactionId: string | null;
  issuedCredential: any;
  presentationDefinition: any;
  verificationResult: VerificationResult | null;
  onVerify: () => void;
}

/** Phase 2 (OpenID4VP): authorization request QR, verdict, present button. */
export const PresentPhase: React.FC<PresentPhaseProps> = ({
  phase,
  verifier,
  transactionId,
  issuedCredential,
  presentationDefinition,
  verificationResult,
  onVerify
}) => {
  const busy = phase === 'issuing' || phase === 'verifying';
  const clientId = getNode(verifier)?.clientId ?? 'https://verifier.example';

  return (
    <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Phase 2: OpenID4VP</span>
          <span className="text-[11px] text-slate-400 font-mono">Response: vp_token</span>
        </div>
        <p className="text-xs text-slate-300 mb-4">
          Verifier dispatches Presentation Definition. Wallet generates Verifiable Presentation and submits cryptographic proof.
        </p>

        {presentationDefinition && (
          <QrPanel
            title="Authorization Request (cross-device QR / same-device link)"
            uri={buildVpRequestUri(presentationDefinition, clientId, transactionId ?? 'nonce')}
          />
        )}
        {verificationResult && <VerdictCard result={verificationResult} />}
      </div>

      <button
        onClick={onVerify}
        disabled={busy || !issuedCredential}
        className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2 ${
          !issuedCredential
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
            : 'bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50'
        }`}
      >
        {phase === 'verifying' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        Trigger "Present & Verify" Flow
      </button>
    </div>
  );
};
