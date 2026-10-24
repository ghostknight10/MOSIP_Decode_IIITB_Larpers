import React from 'react';
import { Bug, FastForward, Play, RotateCcw } from 'lucide-react';
import { CredentialFormat, CredentialSubjectInput, RunInputs, RunPhase, TamperOptions as TamperOptionsValue, VerificationResult, VerifierType } from '../types';
import { Scenario } from '../config/scenarios';
import { IssuePhase } from './flow/IssuePhase';
import { PresentPhase } from './flow/PresentPhase';
import { TamperOptions } from './flow/TamperOptions';
import { ScenarioBar } from './flow/ScenarioBar';

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
  inputs: RunInputs;
  onInputsChange: (inputs: RunInputs) => void;
  onRunScenario: (scenario: Scenario) => void;
}

/**
 * The tamper payload to send, if any. Nothing is sent unless an attack is
 * actually ticked: the mock verifier treats any tamperPayload object as
 * tampered, even with every flag false.
 */
export const activeTamper = ({ tamperMode, tamperOptions }: RunInputs): TamperOptionsValue | undefined =>
  tamperMode && (tamperOptions.forceExpired || tamperOptions.corruptSignature) ? tamperOptions : undefined;

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
  verifier,
  inputs,
  onInputsChange,
  onRunScenario
}) => {
  const { subject: subjectData, tamperMode, tamperOptions } = inputs;
  const busy = phase === 'issuing' || phase === 'verifying';
  const tamper = activeTamper(inputs);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Play className="h-4 w-4 text-emerald-400" />
            Workflow Execution Pipeline
          </h3>
          <p className="text-xs text-slate-400">Execute standard OpenID4VCI and OpenID4VP transactions across the selected nodes.</p>
          {transactionId && <p className="text-xs text-slate-500 font-mono mt-1">Transaction: {transactionId}</p>}
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
            onClick={() => onInputsChange({ ...inputs, tamperMode: !tamperMode })}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
              tamperMode ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-300'
            }`}
          >
            <Bug className="h-3.5 w-3.5" />
            {tamperMode ? 'Tamper / Chaos Mode: ACTIVE' : 'Enable Tamper Mode'}
          </button>
        </div>
      </div>

      {tamperMode && <TamperOptions value={tamperOptions} onChange={tamperOptions => onInputsChange({ ...inputs, tamperOptions })} />}

      <ScenarioBar onRun={onRunScenario} disabled={busy} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-6 items-start">
        <IssuePhase
          phase={phase}
          format={format}
          credentialOffer={credentialOffer}
          issuedCredential={issuedCredential}
          subject={subjectData}
          onSubjectChange={subject => onInputsChange({ ...inputs, subject })}
          onIssue={() => onIssue(subjectData)}
        />
        <PresentPhase
          phase={phase}
          format={format}
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
