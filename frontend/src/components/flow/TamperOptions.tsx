import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { TamperOptions as TamperOptionsValue } from '../../types';

/** Controlled checkboxes for the negative-path attacks applied at presentation. */
export const TamperOptions: React.FC<{ value: TamperOptionsValue; onChange: (value: TamperOptionsValue) => void }> = ({ value, onChange }) => (
  <fieldset className="mb-4 p-3 rounded-md bg-warning-soft border border-warning-line flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink">
    {/* float lets the legend sit inline with the options inside a flex fieldset */}
    <legend className="float-left font-medium text-warning-ink flex items-center gap-1.5">
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      Negative tests
    </legend>
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={value.forceExpired}
        onChange={e => onChange({ ...value, forceExpired: e.target.checked })}
        className="h-4 w-4 accent-accent"
      />
      Expire Timestamp (Negative Path)
    </label>
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={value.corruptSignature}
        onChange={e => onChange({ ...value, corruptSignature: e.target.checked })}
        className="h-4 w-4 accent-accent"
      />
      Corrupt Cryptographic Signature
    </label>
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={Boolean(value.wrongCredentialType)}
        onChange={e => onChange({ ...value, wrongCredentialType: e.target.checked })}
        className="h-4 w-4 accent-accent"
      />
      Use Wrong Credential Type
    </label>
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={Boolean(value.replayPresentation)}
        onChange={e => onChange({ ...value, replayPresentation: e.target.checked })}
        className="h-4 w-4 accent-accent"
      />
      Replay an Earlier Presentation
    </label>
    <span className="text-xs text-ink-muted">Applied when the wallet presents to the verifier.</span>
  </fieldset>
);
