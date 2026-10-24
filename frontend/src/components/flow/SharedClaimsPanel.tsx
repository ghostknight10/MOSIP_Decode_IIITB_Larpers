import React from 'react';
import { AlertTriangle, CheckCircle2, Lock, XCircle, LucideIcon } from 'lucide-react';
import { CredentialFormat } from '../../types';
import { classifyClaims, heldClaims, requestedClaims, sharedClaims } from '../../lib/claims';

interface SharedClaimsPanelProps {
  presentationDefinition: any;
  credential: any;
  format: CredentialFormat;
  verifiedClaims: any;
}

interface Group {
  key: string;
  title: string;
  hint: string;
  Icon: LucideIcon;
  cls: string;
  claims: string[];
}

/**
 * "What was shared": which claims the verifier asked for, received, and never
 * saw. Makes data control and selective disclosure visible (Korir et al. 2022;
 * Sartor et al. 2022).
 */
export const SharedClaimsPanel: React.FC<SharedClaimsPanelProps> = ({ presentationDefinition, credential, format, verifiedClaims }) => {
  const requested = requestedClaims(presentationDefinition);
  const held = heldClaims(credential, format);
  const shared = sharedClaims(verifiedClaims);
  const c = classifyClaims(requested, held, shared);

  const groups: Group[] = [
    { key: 'ok', title: 'Requested and shared', hint: 'What the verifier needed', Icon: CheckCircle2, cls: 'text-emerald-300', claims: c.requestedShared },
    { key: 'over', title: 'Shared without being requested', hint: 'More than the verifier asked for', Icon: AlertTriangle, cls: 'text-amber-300', claims: c.overShared },
    { key: 'missing', title: 'Requested but not shared', hint: 'The verifier did not receive these', Icon: XCircle, cls: 'text-rose-300', claims: c.missing },
    { key: 'private', title: 'Kept private', hint: 'Stayed in the wallet', Icon: Lock, cls: 'text-sky-300', claims: c.keptPrivate }
  ];

  return (
    <section aria-labelledby="shared-claims-heading" className="mb-4 p-3 rounded-lg bg-slate-900 border border-slate-800">
      <h4 id="shared-claims-heading" className="text-xs font-semibold text-white">What was shared</h4>
      <p className="text-xs text-slate-300 mt-1">
        Issuer signed <strong>{held.length}</strong> claims → wallet holds <strong>{held.length}</strong> → verifier asked for{' '}
        <strong>{requested.length}</strong> and received <strong>{shared.length}</strong>.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        {groups.map(g => (
          <div key={g.key} role="group" aria-label={g.title} className="p-2 rounded-md bg-slate-950/60 border border-slate-800">
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${g.cls}`}>
              <g.Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {g.title} ({g.claims.length})
            </div>
            <p className="text-xs text-slate-400">{g.hint}</p>
            {g.claims.length > 0 ? (
              <ul className="flex flex-wrap gap-1 mt-1.5">
                {g.claims.map(name => (
                  <li key={name} className="font-mono text-xs px-1.5 py-0.5 rounded-sm bg-slate-800 text-slate-200">
                    {name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500 mt-1.5">None</p>
            )}
          </div>
        ))}
      </div>
      {c.overShared.length > 0 && (
        <p className="mt-2 text-xs text-amber-300 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          The verifier received {c.overShared.length} claim{c.overShared.length === 1 ? '' : 's'} it did not ask for. With selective disclosure the wallet should
          only release what the presentation definition requests.
        </p>
      )}
    </section>
  );
};
