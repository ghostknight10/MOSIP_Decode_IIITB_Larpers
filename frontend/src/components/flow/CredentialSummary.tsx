import React from 'react';
import { CredentialFormat } from '../../types';
import { FORMATS } from '../../config/nodes';
import { getProofType } from '../../hooks/usePlaygroundRun';
import { summarise } from '../../lib/credential';

/** Key facts about the issued credential: wire format, proof, issuer, type, expiry. */
export const CredentialSummary: React.FC<{ credential: any; format: CredentialFormat }> = ({ credential, format }) => {
  const summary = summarise(credential, format);
  const wireFormat = FORMATS.find(f => f.id === format)?.wireFormat;
  return (
    <dl className="mb-4 p-3 rounded-md bg-surface border border-line grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      <dt className="text-ink-subtle">Format</dt>
      <dd className="text-ink font-mono">{wireFormat}</dd>
      <dt className="text-ink-subtle">Proof</dt>
      <dd className="text-ink font-mono">{getProofType(credential, format)}</dd>
      <dt className="text-ink-subtle">Issuer</dt>
      <dd className="text-ink font-mono truncate">{summary.issuer ?? '—'}</dd>
      <dt className="text-ink-subtle">Type</dt>
      <dd className="text-ink font-mono truncate">{summary.type ?? '—'}</dd>
      <dt className="text-ink-subtle">Expires</dt>
      <dd className="text-ink font-mono">{summary.expires ?? '—'}</dd>
      {summary.extra && (
        <>
          <dt className="text-ink-subtle">Detail</dt>
          <dd className="text-ink font-mono truncate">{summary.extra}</dd>
        </>
      )}
    </dl>
  );
};
