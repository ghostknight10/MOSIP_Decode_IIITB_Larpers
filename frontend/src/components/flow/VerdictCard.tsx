import React from 'react';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { VerificationResult } from '../../types';

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

/** Verifier verdict with the four individual checks. */
export const VerdictCard: React.FC<{ result: VerificationResult }> = ({ result }) => {
  const isValid = result.status === 'VALID';
  // The PS asks for "Valid-but-Expired": signature checks out, only expiry failed.
  const validButExpired = result.status === 'EXPIRED' && result.checks.signatureValid;
  return (
    <div
      role="status"
      className={`p-3 mb-4 rounded-lg border ${
        isValid ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
      }`}
    >
      <div className="flex items-center gap-3">
        {isValid ? <CheckCircle className="h-6 w-6 text-emerald-400 shrink-0" /> : <AlertTriangle className="h-6 w-6 text-rose-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase">Result:</span>
            <span className="text-xs font-extrabold font-mono px-2 py-0.5 rounded-sm bg-slate-900 border">{result.status}</span>
            <span className="text-xs">{validButExpired ? 'Valid but Expired' : STATUS_LABEL[result.status]}</span>
          </div>
          <div className="text-xs text-slate-300 mt-0.5">{result.details}</div>
        </div>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-1.5 text-xs">
        {CHECK_LABELS.map(([key, label]) => {
          const ok = result.checks?.[key];
          return (
            <li key={key} className={`flex items-center gap-1.5 ${ok ? 'text-emerald-300' : 'text-rose-300'}`}>
              {ok ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              {label}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
