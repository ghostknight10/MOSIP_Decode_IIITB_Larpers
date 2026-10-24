import React from 'react';
import { CredentialSubjectInput } from '../../types';

/** Controlled editor for the claims the issuer puts in the credential subject. */
export const SubjectEditor: React.FC<{
  value: CredentialSubjectInput;
  onChange: (value: CredentialSubjectInput) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
    {(Object.keys(value) as (keyof CredentialSubjectInput)[]).map(key => (
      <label key={key} className="text-[11px] text-slate-400 flex flex-col gap-1">
        {key}
        <input
          value={value[key]}
          disabled={disabled}
          onChange={e => onChange({ ...value, [key]: e.target.value })}
          className="px-2 py-1.5 rounded-md bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs"
        />
      </label>
    ))}
  </div>
);
