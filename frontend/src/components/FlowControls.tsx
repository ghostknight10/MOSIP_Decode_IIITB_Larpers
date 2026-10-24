import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Play,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Bug,
  Copy,
  Check,
  FastForward,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  XCircle
} from 'lucide-react';
import { CredentialFormat, CredentialSubjectInput, RunPhase, TamperOptions, VerificationResult, VerifierType } from '../types';
import { DEFAULT_SUBJECT, FORMATS, getNode } from '../config/nodes';
import { getProofType } from '../hooks/usePlaygroundRun';

interface FlowControlsProps {
  onIssue: (subjectData: CredentialSubjectInput) => Promise<unknown>;
  onVerify: (tamperPayload?: TamperOptions) => Promise<unknown>;
  onRunFullFlow: (subjectData: CredentialSubjectInput, tamperPayload?: TamperOptions) => Promise<unknown>;
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

// Practical QR byte capacity at error-correction level L; larger payloads are
// a real interop gap (see problem statement), so we surface it instead of crashing.
const QR_MAX_BYTES = 2900;

const buildOfferUri = (offer: any) =>
  `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(offer))}`;

const buildVpRequestUri = (pd: any, clientId: string, nonce: string) =>
  'openid4vp://authorize?' +
  new URLSearchParams({
    response_type: 'vp_token',
    response_mode: 'direct_post',
    client_id: clientId,
    nonce,
    presentation_definition: JSON.stringify(pd)
  }).toString();

const decodeJwtPayload = (jwt: string) => {
  try {
    const part = jwt.split('~')[0].split('.')[1];
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
};

/** Normalise the two credential shapes into a few display fields. */
const summarise = (credential: any, format: CredentialFormat) => {
  if (format === 'sd-jwt') {
    const payload = credential?.rawToken ? decodeJwtPayload(credential.rawToken) : null;
    const disclosures = credential?.rawToken ? credential.rawToken.split('~').slice(1).filter(Boolean).length : 0;
    return {
      issuer: payload?.iss ?? credential?.decoded?.payload?.iss,
      type: payload?.vct ?? credential?.decoded?.payload?.vct,
      expires: payload?.exp ? new Date(payload.exp * 1000).toISOString() : undefined,
      extra: `${disclosures} selective disclosure${disclosures === 1 ? '' : 's'}`
    };
  }
  return {
    issuer: credential?.issuer?.id ?? credential?.issuer,
    type: Array.isArray(credential?.type) ? credential.type.filter((t: string) => t !== 'VerifiableCredential').join(', ') : credential?.type,
    expires: credential?.expirationDate,
    extra: credential?.proof?.verificationMethod
  };
};

const STATUS_LABEL: Record<VerificationResult['status'], string> = {
  VALID: 'Valid',
  INVALID: 'Invalid',
  EXPIRED: 'Expired',
  SIGNATURE_MISMATCH: 'Signature mismatch'
};

const CHECK_LABELS: [keyof VerificationResult['checks'], string][] = [
  ['formatCheck', 'Format'],
  ['signatureValid', 'Signature'],
  ['notExpired', 'Not expired'],
  ['schemaCompliant', 'Schema']
];

const QrPanel: React.FC<{ title: string; uri: string }> = ({ title, uri }) => {
  const [copied, setCopied] = useState(false);
  const fits = new TextEncoder().encode(uri).length <= QR_MAX_BYTES;
  const copy = () => {
    navigator.clipboard?.writeText(uri).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="p-3 mb-4 rounded-lg bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-start gap-3">
      {fits ? (
        <div className="p-2 bg-white rounded-md shrink-0">
          <QRCodeSVG value={uri} size={132} level="L" />
        </div>
      ) : (
        <div className="p-3 rounded-md border border-amber-500/40 bg-amber-950/20 text-[11px] text-amber-200 w-full sm:w-36 shrink-0">
          Payload exceeds QR capacity ({QR_MAX_BYTES} bytes). Use the deep link or request_uri by reference.
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-white">{title}</div>
        <div className="text-[11px] text-slate-400 font-mono break-all line-clamp-4 mt-1">{uri}</div>
        <div className="flex gap-2 mt-2">
          <button type="button" onClick={copy} className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 flex items-center gap-1">
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <a href={uri} className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200">
            Open on this device
          </a>
        </div>
      </div>
    </div>
  );
};

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
  const [tamperOptions, setTamperOptions] = useState<TamperOptions>({
    forceExpired: false,
    corruptSignature: false
  });
  const [subjectData, setSubjectData] = useState<CredentialSubjectInput>(DEFAULT_SUBJECT);
  const [subjectOpen, setSubjectOpen] = useState(false);

  const busy = phase === 'issuing' || phase === 'verifying';
  const tamper = tamperMode ? tamperOptions : undefined;
  const formatMeta = FORMATS.find(f => f.id === format);
  const summary = issuedCredential ? summarise(issuedCredential, format) : null;
  const clientId = getNode(verifier)?.clientId ?? 'https://verifier.example';
  const isValid = verificationResult?.status === 'VALID';
  // The PS asks for "Valid-but-Expired": signature checks out, only expiry failed.
  const validButExpired = verificationResult?.status === 'EXPIRED' && verificationResult.checks.signatureValid;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Play className="h-4 w-4 text-emerald-400" />
            Workflow Execution Pipeline
          </h3>
          <p className="text-xs text-slate-400">
            Execute standard OpenID4VCI and OpenID4VP transactions across the selected nodes.
          </p>
          {transactionId && (
            <p className="text-[11px] text-slate-500 font-mono mt-1">Transaction: {transactionId}</p>
          )}
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
          {/* Tamper / Negative Testing Toggle */}
          <button
            type="button"
            aria-pressed={tamperMode}
            onClick={() => setTamperMode(!tamperMode)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
              tamperMode
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-300'
            }`}
          >
            <Bug className="h-3.5 w-3.5" />
            {tamperMode ? 'Tamper / Chaos Mode: ACTIVE' : 'Enable Tamper Mode'}
          </button>
        </div>
      </div>

      {/* Tamper Sub-options */}
      {tamperMode && (
        <div className="mb-4 p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 flex flex-wrap items-center gap-6 text-xs text-rose-200">
          <span className="font-semibold flex items-center gap-1">
            <AlertTriangle className="h-4 w-4 text-rose-400" />
            Simulate Attack / Negative Tests:
          </span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={tamperOptions.forceExpired}
              onChange={(e) => setTamperOptions(prev => ({ ...prev, forceExpired: e.target.checked }))}
              className="rounded-sm bg-slate-900 border-rose-600 text-rose-500 focus:ring-0"
            />
            Expire Timestamp (Negative Path)
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={tamperOptions.corruptSignature}
              onChange={(e) => setTamperOptions(prev => ({ ...prev, corruptSignature: e.target.checked }))}
              className="rounded-sm bg-slate-900 border-rose-600 text-rose-500 focus:ring-0"
            />
            Corrupt Cryptographic Signature
          </label>
          <span className="text-[11px] text-rose-300/70">Applied when the wallet presents to the verifier.</span>
        </div>
      )}

      {/* Action Pipeline Steps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Step A: Issuance */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
                Phase 1: OpenID4VCI
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                Grant: Pre-authorized Code
              </span>
            </div>
            <p className="text-xs text-slate-300 mb-3">
              Issuer generates a standardized Credential Offer QR code. Wallet retrieves offer and requests{' '}
              <span className="font-semibold">{formatMeta?.label}</span> (<span className="font-mono">{formatMeta?.wireFormat}</span>).
            </p>

            {/* Credential subject editor */}
            <button
              type="button"
              onClick={() => setSubjectOpen(!subjectOpen)}
              aria-expanded={subjectOpen}
              className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 mb-3"
            >
              {subjectOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Credential subject claims
            </button>
            {subjectOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {(Object.keys(subjectData) as (keyof CredentialSubjectInput)[]).map(key => (
                  <label key={key} className="text-[11px] text-slate-400 flex flex-col gap-1">
                    {key}
                    <input
                      value={subjectData[key]}
                      disabled={busy}
                      onChange={e => setSubjectData(prev => ({ ...prev, [key]: e.target.value }))}
                      className="px-2 py-1.5 rounded-md bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs"
                    />
                  </label>
                ))}
              </div>
            )}

            {credentialOffer && <QrPanel title="Credential Offer (scan with Inji Wallet)" uri={buildOfferUri(credentialOffer)} />}
            {issuedCredential && !credentialOffer && (
              <p className="mb-4 text-[11px] text-amber-300">Issuer returned a credential without a credential offer payload.</p>
            )}

            {summary && (
              <dl className="mb-4 p-3 rounded-lg bg-slate-900 border border-slate-800 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                <dt className="text-slate-500">Format</dt>
                <dd className="text-slate-200 font-mono">{formatMeta?.wireFormat}</dd>
                <dt className="text-slate-500">Proof</dt>
                <dd className="text-slate-200 font-mono">{getProofType(issuedCredential, format)}</dd>
                <dt className="text-slate-500">Issuer</dt>
                <dd className="text-slate-200 font-mono truncate">{summary.issuer ?? '—'}</dd>
                <dt className="text-slate-500">Type</dt>
                <dd className="text-slate-200 font-mono truncate">{summary.type ?? '—'}</dd>
                <dt className="text-slate-500">Expires</dt>
                <dd className="text-slate-200 font-mono">{summary.expires ?? '—'}</dd>
                {summary.extra && (
                  <>
                    <dt className="text-slate-500">Detail</dt>
                    <dd className="text-slate-200 font-mono truncate">{summary.extra}</dd>
                  </>
                )}
              </dl>
            )}
          </div>

          <button
            onClick={() => onIssue(subjectData)}
            disabled={busy}
            className="w-full py-2.5 px-4 rounded-xl bg-linear-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold text-xs transition-all shadow-lg shadow-sky-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {phase === 'issuing' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-white" />}
            Trigger "Issue Credential" Flow
          </button>
        </div>

        {/* Step B: Verification */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Phase 2: OpenID4VP
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                Response: vp_token
              </span>
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

            {verificationResult && (
              <div
                role="status"
                className={`p-3 mb-4 rounded-lg border ${
                  isValid
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  {isValid ? (
                    <CheckCircle className="h-6 w-6 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-6 w-6 text-rose-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold uppercase">Result:</span>
                      <span className="text-xs font-extrabold font-mono px-2 py-0.5 rounded-sm bg-slate-900 border">
                        {verificationResult.status}
                      </span>
                      <span className="text-[11px]">
                        {validButExpired ? 'Valid but Expired' : STATUS_LABEL[verificationResult.status]}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 mt-0.5">{verificationResult.details}</div>
                  </div>
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-1.5 text-[11px]">
                  {CHECK_LABELS.map(([key, label]) => {
                    const ok = verificationResult.checks?.[key];
                    return (
                      <li key={key} className={`flex items-center gap-1.5 ${ok ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {ok ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {label}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          <button
            onClick={() => onVerify(tamper)}
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
      </div>
    </div>
  );
};
