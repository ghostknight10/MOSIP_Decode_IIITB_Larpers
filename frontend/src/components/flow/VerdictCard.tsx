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
      className={`p-3 mb-4 rounded-md border ${
        isValid ? 'bg-success-soft border-success-line text-success-ink' : 'bg-danger-soft border-danger-line text-danger-ink'
      }`}
    >
      <div className="flex items-center gap-3">
        {isValid ? <CheckCircle className="h-5 w-5 shrink-0" aria-hidden="true" /> : <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Result:</span>
            <span className="text-xs font-semibold font-mono px-1.5 py-0.5 rounded bg-surface border border-current">{result.status}</span>
            <span className="text-xs">{validButExpired ? 'Valid but Expired' : STATUS_LABEL[result.status]}</span>
          </div>
          <div className="text-sm text-ink mt-0.5">{result.details}</div>
        </div>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-1.5 text-xs">
        {CHECK_LABELS.map(([key, label]) => {
          const ok = result.checks?.[key];
          return (
            <li key={key} className={`flex items-center gap-1.5 ${ok ? 'text-success-ink' : 'text-danger-ink'}`}>
              {ok ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              {label}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
