import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Play, RefreshCw } from 'lucide-react';
import { CredentialFormat, CredentialSubjectInput, RunPhase } from '../../types';
import { FORMATS } from '../../config/nodes';
import { absoluteUrl, buildOfferUri, buildOfferUriByReference } from '../../lib/credential';
import { QrPanel } from './QrPanel';
import { btnPrimary, btnSecondary } from '../ui';
import { CredentialSummary } from './CredentialSummary';
import { SubjectEditor } from './SubjectEditor';
import { CredentialInspector } from './CredentialInspector';

interface IssuePhaseProps {
  phase: RunPhase;
  format: CredentialFormat;
  credentialOffer: any;
  credentialOfferUri?: string | null;
  issuedCredential: any;
  subject: CredentialSubjectInput;
  onSubjectChange: (subject: CredentialSubjectInput) => void;
  onIssue: () => void;
  /** Puts an external credential in the wallet; returns an error message or null. */
  onImport: (text: string) => string | null;
  imported: boolean;
}

/** Phase 1 (OpenID4VCI): subject claims, offer QR, credential summary, issue button. */
export const IssuePhase: React.FC<IssuePhaseProps> = ({ phase, format, credentialOffer, credentialOfferUri, issuedCredential, subject, onSubjectChange, onIssue, onImport, imported }) => {
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const holdImported = () => {
    const error = onImport(importText);
    setImportError(error);
    if (!error) setImportOpen(false);
  };
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

        <button
          type="button"
          onClick={() => setImportOpen(!importOpen)}
          aria-expanded={importOpen}
          className="text-xs text-ink-muted hover:text-ink flex items-center gap-1 mb-3"
        >
          {importOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Use a credential from outside the playground
        </button>
        {importOpen && (
          <div className="mb-4 space-y-2">
            <p className="text-xs text-ink-muted">
              Paste a W3C credential (JSON) or an SD-JWT, for example one downloaded from Inji Web after signing in with eSignet. The wallet holds
              it and presents it in Phase 2, so a real Inji credential can be tested against both verifiers.
            </p>
            <textarea
              aria-label="Credential to import"
              value={importText}
              onChange={e => setImportText(e.target.value)}
              rows={5}
              spellCheck={false}
              className="w-full p-2 rounded border border-line-strong bg-surface font-mono text-xs text-ink"
            />
            {importError && <p role="alert" className="text-xs text-danger-ink">{importError}</p>}
            <button type="button" onClick={holdImported} disabled={busy} className={btnSecondary}>
              Hold this credential
            </button>
          </div>
        )}

        {credentialOffer && (
          <QrPanel
            title="Credential Offer (scan with Inji Wallet)"
            uri={buildOfferUri(credentialOffer)}
            referenceUri={credentialOfferUri ? buildOfferUriByReference(absoluteUrl(credentialOfferUri)) : undefined}
          />
        )}
        {imported && <p className="mb-4 text-xs text-ink-muted">Imported credential: issued outside the playground.</p>}
        {issuedCredential && !credentialOffer && !imported && (
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
