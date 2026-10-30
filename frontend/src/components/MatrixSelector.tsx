import React from 'react';
import { CredentialFormat, NodeRole, RunPhase, VerificationStatus } from '../types';
import { Selection } from '../hooks/usePlaygroundRun';
import { FORMATS, ISSUERS, NodeDescriptor, VERIFIERS, WALLETS } from '../config/nodes';
import { BadgeCheck, Check, CheckCircle2, ChevronRight, Circle, Landmark, Loader2, LucideIcon, ShieldAlert, Wallet as WalletIcon, XCircle } from 'lucide-react';

interface MatrixSelectorProps {
  selection: Selection;
  onSelect: (patch: Partial<Selection>) => void;
  phase: RunPhase;
  hasCredential: boolean;
  verificationStatus?: VerificationStatus;
  /** Which roles were answered by the emulated sandbox in this run. */
  emulated: Record<NodeRole, boolean>;
}

export type ColumnStatus = 'standby' | 'active' | 'holding' | 'done' | 'rejected' | 'failed';

const NEUTRAL = 'bg-surface-muted text-ink-muted border-line';
const STATUS_STYLE: Record<ColumnStatus, { label: string; className: string; Icon: LucideIcon; spin?: boolean }> = {
  standby: { label: 'Standby', className: NEUTRAL, Icon: Circle },
  active: { label: 'In progress', className: NEUTRAL, Icon: Loader2, spin: true },
  holding: { label: 'Holding VC', className: NEUTRAL, Icon: WalletIcon },
  done: { label: 'Done', className: 'bg-success-soft text-success-ink border-success-line', Icon: CheckCircle2 },
  rejected: { label: 'Rejected', className: 'bg-danger-soft text-danger-ink border-danger-line', Icon: ShieldAlert },
  failed: { label: 'Error', className: 'bg-danger-soft text-danger-ink border-danger-line', Icon: XCircle }
};

/** Derive each role's live status from the run phase. */
export const columnStatus = (role: NodeRole, phase: RunPhase, hasCredential: boolean, verification?: VerificationStatus): ColumnStatus => {
  const issued = hasCredential && phase !== 'issuing';
  switch (role) {
    case 'issuer':
      if (phase === 'issuing') return 'active';
      if (issued) return 'done';
      return phase === 'failed' ? 'failed' : 'standby';
    case 'wallet':
      if (phase === 'issuing' || phase === 'verifying') return 'active';
      if (phase === 'issued') return 'holding';
      if (phase === 'verified' || (phase === 'failed' && verification)) return 'done';
      return phase === 'failed' ? 'failed' : 'standby';
    case 'verifier':
      if (phase === 'verifying') return 'active';
      if (phase === 'verified') return 'done';
      if (phase === 'failed' && verification) return 'rejected';
      if (phase === 'failed' && issued) return 'failed';
      return 'standby';
  }
};

const ROLE_META: Record<NodeRole, { step: number; title: string; protocol: string; Icon: LucideIcon }> = {
  issuer: { step: 1, title: 'Issuer', protocol: 'OpenID4VCI', Icon: Landmark },
  wallet: { step: 2, title: 'Wallet', protocol: 'Holder', Icon: WalletIcon },
  verifier: { step: 3, title: 'Verifier', protocol: 'OpenID4VP', Icon: BadgeCheck }
};

const StatusBadge: React.FC<{ status: ColumnStatus; detail?: string }> = ({ status, detail }) => {
  const { label, className, Icon, spin } = STATUS_STYLE[status];
  return (
    <span aria-live="polite" className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${className}`}>
      <Icon className={`h-3 w-3 ${spin ? 'animate-spin' : ''}`} aria-hidden="true" />
      {detail ?? label}
    </span>
  );
};

interface RoleColumnProps<Id extends string> {
  role: NodeRole;
  nodes: NodeDescriptor<Id>[];
  selectedId: Id;
  onPick: (id: Id) => void;
  status: ColumnStatus;
  statusDetail?: string;
  locked: boolean;
  format: CredentialFormat;
  emulated: boolean;
}

function RoleColumn<Id extends string>({ role, nodes, selectedId, onPick, status, statusDetail, locked, format, emulated }: RoleColumnProps<Id>) {
  const meta = ROLE_META[role];
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-ink">
          {meta.step}. {meta.title} <span className="font-normal text-ink-subtle">· {meta.protocol}</span>
        </h3>
        <StatusBadge status={status} detail={statusDetail} />
      </div>

      <div role="radiogroup" aria-label={meta.title} className="grid grid-cols-2 md:grid-cols-1 gap-2 flex-1">
        {nodes.map(node => {
          const selected = node.id === selectedId;
          const unsupported = !node.supportedFormats.includes(format);
          const showEmulated = selected && node.isMosip && emulated;
          return (
            <button
              key={node.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={locked || unsupported}
              onClick={() => onPick(node.id)}
              className={`w-full text-left p-3 rounded-md border transition-colors disabled:cursor-not-allowed ${
                selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-muted'
              } ${unsupported ? 'opacity-50' : ''}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-sm font-medium text-ink inline-flex items-center gap-2">
                  {selected ? <Check className="h-4 w-4 text-accent" aria-hidden="true" /> : <meta.Icon className="h-4 w-4 text-ink-subtle" aria-hidden="true" />}
                  {node.label}
                </span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded border ${
                    showEmulated ? 'bg-warning-soft text-warning-ink border-warning-line' : 'bg-surface-muted text-ink-muted border-line'
                  }`}
                >
                  {showEmulated ? 'Emulated' : node.badge}
                </span>
              </div>
              {/* Descriptions only for the chosen node, and only where there is room. */}
              {selected && <p className="hidden md:block text-xs text-ink-muted mt-1.5">{node.description}</p>}
              {unsupported && <p className="text-xs text-warning-ink mt-1">Does not support the selected format</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const Connector: React.FC<{ lit: boolean }> = ({ lit }) => (
  <div className="hidden md:flex items-center justify-center pt-7" aria-hidden="true">
    <ChevronRight className={`h-5 w-5 transition-colors ${lit ? 'text-success-ink' : 'text-line-strong'}`} />
  </div>
);

export const MatrixSelector: React.FC<MatrixSelectorProps> = ({
  selection,
  onSelect,
  phase,
  hasCredential,
  verificationStatus,
  emulated
}) => {
  const locked = phase === 'issuing' || phase === 'verifying';
  const statuses = {
    issuer: columnStatus('issuer', phase, hasCredential, verificationStatus),
    wallet: columnStatus('wallet', phase, hasCredential, verificationStatus),
    verifier: columnStatus('verifier', phase, hasCredential, verificationStatus)
  };
  const verifierDetail =
    statuses.verifier === 'done' || statuses.verifier === 'rejected' ? verificationStatus : undefined;
  const selectedNodes = [
    ISSUERS.find(n => n.id === selection.issuer),
    WALLETS.find(n => n.id === selection.wallet),
    VERIFIERS.find(n => n.id === selection.verifier)
  ];

  return (
    <section aria-labelledby="matrix-heading" data-tour="matrix" className="bg-surface border border-line rounded-md p-4 sm:p-5 mb-5">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-4 mb-4 border-b border-line">
        <div>
          <h2 id="matrix-heading" className="text-base font-semibold text-ink">Interoperability matrix</h2>
          <p className="text-sm text-ink-muted">Choose who issues, holds and verifies the credential, and in which format.</p>
        </div>

        <div role="radiogroup" aria-label="Credential format" data-tour="format" className="w-full sm:w-auto inline-flex rounded border border-line-strong overflow-hidden text-sm">
          {FORMATS.map(f => {
            const active = selection.format === f.id;
            const supported = selectedNodes.every(n => n?.supportedFormats.includes(f.id));
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={locked || !supported}
                onClick={() => onSelect({ format: f.id })}
                className={`flex-1 sm:flex-none px-3 py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50 not-first:border-l not-first:border-line-strong ${
                  active ? 'bg-accent text-on-accent' : 'bg-surface text-ink hover:bg-surface-muted'
                }`}
              >
                {f.label} <span className={`font-mono text-xs ${active ? 'text-on-accent' : 'text-ink-subtle'}`}>{f.wireFormat}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-4 md:gap-3">
        <RoleColumn
          role="issuer"
          nodes={ISSUERS}
          selectedId={selection.issuer}
          onPick={issuer => onSelect({ issuer })}
          status={statuses.issuer}
          locked={locked}
          format={selection.format}
          emulated={emulated.issuer}
        />
        <Connector lit={statuses.issuer === 'done'} />
        <RoleColumn
          role="wallet"
          nodes={WALLETS}
          selectedId={selection.wallet}
          onPick={wallet => onSelect({ wallet })}
          status={statuses.wallet}
          locked={locked}
          format={selection.format}
          emulated={emulated.wallet}
        />
        <Connector lit={statuses.verifier === 'done' || statuses.verifier === 'rejected'} />
        <RoleColumn
          role="verifier"
          nodes={VERIFIERS}
          selectedId={selection.verifier}
          onPick={verifier => onSelect({ verifier })}
          status={statuses.verifier}
          statusDetail={verifierDetail}
          locked={locked}
          format={selection.format}
          emulated={emulated.verifier}
        />
      </div>
    </section>
  );
};
