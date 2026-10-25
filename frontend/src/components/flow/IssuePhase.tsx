import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Play, RefreshCw } from 'lucide-react';
import { CredentialFormat, CredentialSubjectInput, RunPhase } from '../../types';
import { FORMATS } from '../../config/nodes';
import { buildOfferUri } from '../../lib/credential';
import { QrPanel } from './QrPanel';
import { btnPrimary } from '../ui';
import { CredentialSummary } from './CredentialSummary';
import { SubjectEditor } from './SubjectEditor';
import { CredentialInspector } from './CredentialInspector';

interface IssuePhaseProps {
  phase: RunPhase;
  format: CredentialFormat;
  credentialOffer: any;
  issuedCredential: any;
  subject: CredentialSubjectInput;
  onSubjectChange: (subject: CredentialSubjectInput) => void;
  onIssue: () => void;
}

/** Phase 1 (OpenID4VCI): subject claims, offer QR, credential summary, issue button. */
export const IssuePhase: React.FC<IssuePhaseProps> = ({ phase, format, credentialOffer, issuedCredential, subject, onSubjectChange, onIssue }) => {
  const [subjectOpen, setSubjectOpen] = useState(false);
  const busy = phase === 'issuing' || phase === 'verifying';
  const formatMeta = FORMATS.find(f => f.id === format);

  return (
    <section aria-label="Phase 1: issue" className="p-4 rounded-md border border-line bg-surface flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-ink">Phase 1 · Issue</h4>
          <span className="text-xs text-ink-subtle font-mono">OpenID4VCI · pre-authorized code</span>
        </div>
        <p className="text-xs text-ink-muted mb-3">
          Issuer generates a standardized Credential Offer QR code. Wallet retrieves offer and requests{' '}
          <span className="font-semibold">{formatMeta?.label}</span> (<span className="font-mono">{formatMeta?.wireFormat}</span>).
        </p>

        <button
          type="button"
          onClick={() => setSubjectOpen(!subjectOpen)}
          aria-expanded={subjectOpen}
          className="text-xs text-ink-muted hover:text-ink flex items-center gap-1 mb-3"
        >
          {subjectOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Credential subject claims
        </button>
        {subjectOpen && <SubjectEditor value={subject} onChange={onSubjectChange} disabled={busy} />}

        {credentialOffer && <QrPanel title="Credential Offer (scan with Inji Wallet)" uri={buildOfferUri(credentialOffer)} />}
        {issuedCredential && !credentialOffer && (
          <p className="mb-4 text-xs text-warning-ink">Issuer returned a credential without a credential offer payload.</p>
        )}
        {issuedCredential && <CredentialSummary credential={issuedCredential} format={format} />}
        {issuedCredential && <CredentialInspector credential={issuedCredential} format={format} />}
      </div>

      <button
        onClick={onIssue}
        disabled={busy}
        className={`w-full ${btnPrimary}`}
      >
        {phase === 'issuing' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        Trigger "Issue Credential" Flow
      </button>
    </section>
  );
};
