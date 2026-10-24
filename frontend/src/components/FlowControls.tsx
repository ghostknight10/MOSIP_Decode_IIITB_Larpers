import React, { useState } from 'react';
import { Bug, FastForward, Play, RotateCcw } from 'lucide-react';
import { CredentialFormat, CredentialSubjectInput, RunPhase, TamperOptions as TamperOptionsValue, VerificationResult, VerifierType } from '../types';
import { DEFAULT_SUBJECT } from '../config/nodes';
import { IssuePhase } from './flow/IssuePhase';
import { PresentPhase } from './flow/PresentPhase';
import { TamperOptions } from './flow/TamperOptions';

// Re-exported for existing imports; the implementations live in lib/credential.
export { QR_MAX_BYTES, buildOfferUri, buildVpRequestUri, summarise } from '../lib/credential';

interface FlowControlsProps {
  onIssue: (subjectData: CredentialSubjectInput) => Promise<unknown>;
  onVerify: (tamperPayload?: TamperOptionsValue) => Promise<unknown>;
  onRunFullFlow: (subjectData: CredentialSubjectInput, tamperPayload?: TamperOptionsValue) => Promise<unknown>;
  onReset: () => void;
  phase: RunPhase;
  transactionId: string | null;
  issuedCredential: any;
  credentialOffer: any;
  presentationDefinition: any;
  verificationResult: VerificationResult | null;
  format: CredentialFormat;
  verifier: VerifierType;
}

export const FlowControls: React.FC<FlowControlsProps> = ({
  onIssue,
  onVerify,
  onRunFullFlow,
  onReset,
  phase,
  transactionId,
  issuedCredential,
  credentialOffer,
  presentationDefinition,
  verificationResult,
  format,
  verifier
}) => {
  const [tamperMode, setTamperMode] = useState(false);
  const [tamperOptions, setTamperOptions] = useState<TamperOptionsValue>({ forceExpired: false, corruptSignature: false });
  const [subjectData, setSubjectData] = useState<CredentialSubjectInput>(DEFAULT_SUBJECT);

  const busy = phase === 'issuing' || phase === 'verifying';
  // Send nothing unless an attack is actually selected: the mock verifier
  // treats any tamperPayload object as tampered, even with every flag false.
  const tamper = tamperMode && (tamperOptions.forceExpired || tamperOptions.corruptSignature) ? tamperOptions : undefined;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Play className="h-4 w-4 text-emerald-400" />
            Workflow Execution Pipeline
          </h3>
          <p className="text-xs text-slate-400">Execute standard OpenID4VCI and OpenID4VP transactions across the selected nodes.</p>
          {transactionId && <p className="text-[11px] text-slate-500 font-mono mt-1">Transaction: {transactionId}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onRunFullFlow(subjectData, tamper)}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border bg-sky-600/20 text-sky-200 border-sky-500/40 hover:bg-sky-600/30 disabled:opacity-50"
          >
            <FastForward className="h-3.5 w-3.5" />
            Run Full Flow
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={busy || phase === 'idle'}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <button
            type="button"
            aria-pressed={tamperMode}
            onClick={() => setTamperMode(!tamperMode)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
              tamperMode ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-300'
            }`}
          >
            <Bug className="h-3.5 w-3.5" />
            {tamperMode ? 'Tamper / Chaos Mode: ACTIVE' : 'Enable Tamper Mode'}
          </button>
        </div>
      </div>

      {tamperMode && <TamperOptions value={tamperOptions} onChange={setTamperOptions} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <IssuePhase
          phase={phase}
          format={format}
          credentialOffer={credentialOffer}
          issuedCredential={issuedCredential}
          subject={subjectData}
          onSubjectChange={setSubjectData}
          onIssue={() => onIssue(subjectData)}
        />
        <PresentPhase
          phase={phase}
          verifier={verifier}
          transactionId={transactionId}
          issuedCredential={issuedCredential}
          presentationDefinition={presentationDefinition}
          verificationResult={verificationResult}
          onVerify={() => onVerify(tamper)}
        />
      </div>
    </div>
  );
};
