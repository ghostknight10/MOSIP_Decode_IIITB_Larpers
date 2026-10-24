import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { TamperOptions as TamperOptionsValue } from '../../types';

/** Controlled checkboxes for the negative-path attacks applied at presentation. */
export const TamperOptions: React.FC<{ value: TamperOptionsValue; onChange: (value: TamperOptionsValue) => void }> = ({ value, onChange }) => (
  <div className="mb-4 p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 flex flex-wrap items-center gap-6 text-xs text-rose-200">
    <span className="font-semibold flex items-center gap-1">
      <AlertTriangle className="h-4 w-4 text-rose-400" />
      Simulate Attack / Negative Tests:
    </span>
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={value.forceExpired}
        onChange={e => onChange({ ...value, forceExpired: e.target.checked })}
        className="rounded-sm bg-slate-900 border-rose-600 text-rose-500 focus:ring-0"
      />
      Expire Timestamp (Negative Path)
    </label>
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={value.corruptSignature}
        onChange={e => onChange({ ...value, corruptSignature: e.target.checked })}
        className="rounded-sm bg-slate-900 border-rose-600 text-rose-500 focus:ring-0"
      />
      Corrupt Cryptographic Signature
    </label>
    <span className="text-xs text-rose-300/70">Applied when the wallet presents to the verifier.</span>
  </div>
);
