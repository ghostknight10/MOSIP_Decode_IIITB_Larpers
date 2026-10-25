import React from 'react';
import { Bug, FastForward, RotateCcw } from 'lucide-react';
import { CredentialFormat, CredentialSubjectInput, RunInputs, RunPhase, TamperOptions as TamperOptionsValue, VerificationResult, VerifierType } from '../types';
import { Scenario } from '../config/scenarios';
import { IssuePhase } from './flow/IssuePhase';
import { PresentPhase } from './flow/PresentPhase';
import { TamperOptions } from './flow/TamperOptions';
import { ScenarioBar } from './flow/ScenarioBar';
import { btnPrimary, btnSecondary } from './ui';

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
    <section aria-labelledby="workflow-heading" className="bg-surface border border-line rounded-md p-4 sm:p-5 mb-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-line">
        <div>
          <h3 id="workflow-heading" className="text-base font-semibold text-ink">Run a flow</h3>
          <p className="text-sm text-ink-muted">Issue a credential, then present it to the verifier.</p>
          {transactionId && <p className="text-xs text-ink-subtle font-mono mt-1">Transaction: {transactionId}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onRunFullFlow(subjectData, tamper)}
            disabled={busy}
            className={btnPrimary}
          >
            <FastForward className="h-3.5 w-3.5" />
            Run Full Flow
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={busy || phase === 'idle'}
            className={btnSecondary}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <button
            type="button"
            aria-pressed={tamperMode}
            onClick={() => onInputsChange({ ...inputs, tamperMode: !tamperMode })}
            className={tamperMode ? `${btnSecondary} border-warning-line bg-warning-soft text-warning-ink hover:bg-warning-soft` : btnSecondary}
          >
            <Bug className="h-3.5 w-3.5" />
            {tamperMode ? 'Tamper mode: on' : 'Enable Tamper Mode'}
          </button>
        </div>
      </div>

      {tamperMode && <TamperOptions value={tamperOptions} onChange={tamperOptions => onInputsChange({ ...inputs, tamperOptions })} />}

      <ScenarioBar onRun={onRunScenario} disabled={busy} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4 items-start">
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
    </section>
  );
};
