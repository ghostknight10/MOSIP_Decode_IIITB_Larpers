import React from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { CredentialFormat, RunPhase, VerificationResult, VerifierType } from '../../types';
import { getNode } from '../../config/nodes';
import { buildVpRequestUri } from '../../lib/credential';
import { QrPanel } from './QrPanel';
import { btnPrimary } from '../ui';
import { VerdictCard } from './VerdictCard';
import { SharedClaimsPanel } from './SharedClaimsPanel';

interface PresentPhaseProps {
  phase: RunPhase;
  format: CredentialFormat;
  verifier: VerifierType;
  transactionId: string | null;
  issuedCredential: any;
  presentationDefinition: any;
  presentationRequest?: { clientId: string; nonce: string } | null;
  verificationResult: VerificationResult | null;
  onVerify: () => void;
}

/** Phase 2 (OpenID4VP): authorization request QR, verdict, present button. */
export const PresentPhase: React.FC<PresentPhaseProps> = ({
  phase,
  format,
  verifier,
  transactionId,
  issuedCredential,
  presentationDefinition,
  presentationRequest,
  verificationResult,
  onVerify
}) => {
  const busy = phase === 'issuing' || phase === 'verifying';
  const clientId = getNode(verifier)?.clientId ?? 'https://verifier.example';

  return (
    <section aria-label="Phase 2: present and verify" className="p-4 rounded-md border border-line bg-surface flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-ink">Phase 2 · Present and verify</h4>
          <span className="text-xs text-ink-subtle font-mono">OpenID4VP · vp_token</span>
        </div>
        <p className="text-xs text-ink-muted mb-4">
          Verifier dispatches Presentation Definition. Wallet generates Verifiable Presentation and submits cryptographic proof.
        </p>

        {presentationDefinition && (
          <QrPanel
            title="Authorization Request (cross-device QR / same-device link)"
            uri={buildVpRequestUri(
              presentationDefinition,
              presentationRequest?.clientId ?? clientId,
              presentationRequest?.nonce ?? transactionId ?? 'nonce'
            )}
          />
        )}
        {verificationResult && <VerdictCard result={verificationResult} />}
        {verificationResult && (
          <SharedClaimsPanel
            presentationDefinition={presentationDefinition}
            credential={issuedCredential}
            format={format}
            verifiedClaims={verificationResult.verifiedClaims}
          />
        )}
      </div>

      <button
        onClick={onVerify}
        disabled={busy || !issuedCredential}
        className={`w-full ${btnPrimary}`}
      >
        {phase === 'verifying' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        Trigger "Present & Verify" Flow
      </button>
    </section>
  );
};
