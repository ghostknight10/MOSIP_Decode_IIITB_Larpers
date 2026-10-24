import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Play, RefreshCw } from 'lucide-react';
import { CredentialFormat, CredentialSubjectInput, RunPhase } from '../../types';
import { FORMATS } from '../../config/nodes';
import { buildOfferUri } from '../../lib/credential';
import { QrPanel } from './QrPanel';
import { CredentialSummary } from './CredentialSummary';
import { SubjectEditor } from './SubjectEditor';

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
    <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-sky-400">Phase 1: OpenID4VCI</span>
          <span className="text-[11px] text-slate-400 font-mono">Grant: Pre-authorized Code</span>
        </div>
        <p className="text-xs text-slate-300 mb-3">
          Issuer generates a standardized Credential Offer QR code. Wallet retrieves offer and requests{' '}
          <span className="font-semibold">{formatMeta?.label}</span> (<span className="font-mono">{formatMeta?.wireFormat}</span>).
        </p>

        <button
          type="button"
          onClick={() => setSubjectOpen(!subjectOpen)}
          aria-expanded={subjectOpen}
          className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 mb-3"
        >
          {subjectOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Credential subject claims
        </button>
        {subjectOpen && <SubjectEditor value={subject} onChange={onSubjectChange} disabled={busy} />}

        {credentialOffer && <QrPanel title="Credential Offer (scan with Inji Wallet)" uri={buildOfferUri(credentialOffer)} />}
        {issuedCredential && !credentialOffer && (
          <p className="mb-4 text-[11px] text-amber-300">Issuer returned a credential without a credential offer payload.</p>
        )}
        {issuedCredential && <CredentialSummary credential={issuedCredential} format={format} />}
      </div>

      <button
        onClick={onIssue}
        disabled={busy}
        className="w-full py-2.5 px-4 rounded-xl bg-linear-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold text-xs transition-all shadow-lg shadow-sky-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {phase === 'issuing' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-white" />}
        Trigger "Issue Credential" Flow
      </button>
    </div>
  );
};
