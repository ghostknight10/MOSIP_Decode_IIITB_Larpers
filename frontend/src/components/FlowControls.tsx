import React, { useState } from 'react';
import { Play, ArrowRight, CheckCircle, AlertTriangle, QrCode, RefreshCw, Bug } from 'lucide-react';
import { CredentialFormat, VerificationResult } from '../types';

interface FlowControlsProps {
  onIssue: (subjectData: any, tamperPayload?: any) => Promise<void>;
  onVerify: (tamperPayload?: any) => Promise<void>;
  loading: boolean;
  issuedCredential: any;
  credentialOffer: any;
  verificationResult: VerificationResult | null;
  format: CredentialFormat;
}

export const FlowControls: React.FC<FlowControlsProps> = ({
  onIssue,
  onVerify,
  loading,
  issuedCredential,
  credentialOffer,
  verificationResult,
  format
}) => {
  const [tamperMode, setTamperMode] = useState(false);
  const [tamperOptions, setTamperOptions] = useState({
    forceExpired: false,
    corruptSignature: false
  });

  const [subjectData, setSubjectData] = useState({
    fullName: 'Aaditya Sharma',
    dob: '1995-08-15',
    nationalId: 'MOSIP-IND-9876-5432-1098',
    email: 'aaditya.sharma@example.org',
    country: 'IND'
  });

  const handleIssueClick = () => {
    onIssue(subjectData, tamperMode ? tamperOptions : undefined);
  };

  const handleVerifyClick = () => {
    onVerify(tamperMode ? tamperOptions : undefined);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Play className="h-4 w-4 text-emerald-400" />
            Workflow Execution Pipeline
          </h3>
          <p className="text-xs text-slate-400">
            Execute standard OpenID4VCI and OpenID4VP transactions across the selected nodes.
          </p>
        </div>

        {/* Tamper / Negative Testing Toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
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
              className="rounded bg-slate-900 border-rose-600 text-rose-500 focus:ring-0"
            />
            Expire Timestamp (Negative Path)
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={tamperOptions.corruptSignature}
              onChange={(e) => setTamperOptions(prev => ({ ...prev, corruptSignature: e.target.checked }))}
              className="rounded bg-slate-900 border-rose-600 text-rose-500 focus:ring-0"
            />
            Corrupt Cryptographic Signature
          </label>
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
            <p className="text-xs text-slate-300 mb-4">
              Issuer generates a standardized Credential Offer QR code. Wallet retrieves offer and requests {format === 'sd-jwt' ? 'SD-JWT VC' : 'W3C VC JSON-LD'}.
            </p>

            {credentialOffer && (
              <div className="p-3 mb-4 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-3">
                <div className="p-2 bg-white rounded-md">
                  <QrCode className="h-10 w-10 text-slate-950" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="text-xs font-semibold text-white">Credential Offer Generated</div>
                  <div className="text-[11px] text-slate-400 font-mono truncate">
                    openid-credential-offer://?credential_issuer=...
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleIssueClick}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold text-xs transition-all shadow-lg shadow-sky-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-white" />}
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

            {verificationResult && (
              <div className={`p-3 mb-4 rounded-lg border flex items-center gap-3 ${
                verificationResult.status === 'VALID'
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
              }`}>
                {verificationResult.status === 'VALID' ? (
                  <CheckCircle className="h-6 w-6 text-emerald-400 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-rose-400 flex-shrink-0" />
                )}
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase">Result:</span>
                    <span className="text-xs font-extrabold font-mono px-2 py-0.5 rounded bg-slate-900 border">
                      {verificationResult.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 mt-0.5 truncate">
                    {verificationResult.details}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleVerifyClick}
            disabled={loading || !issuedCredential}
            className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2 ${
              !issuedCredential
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/20'
            }`}
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Trigger "Present & Verify" Flow
          </button>
        </div>
      </div>
    </div>
  );
};
