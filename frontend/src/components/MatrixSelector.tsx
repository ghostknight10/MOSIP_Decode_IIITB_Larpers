import React from 'react';
import { CredentialFormat, NodeRole, RunPhase, VerificationStatus } from '../types';
import { Selection } from '../hooks/usePlaygroundRun';
import { FORMATS, ISSUERS, NodeDescriptor, VERIFIERS, WALLETS } from '../config/nodes';
import {
  Landmark,
  Wallet as WalletIcon,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
  FileCode2,
  ChevronRight,
  Loader2,
  XCircle,
  Circle,
  LucideIcon
} from 'lucide-react';

interface MatrixSelectorProps {
  selection: Selection;
  onSelect: (patch: Partial<Selection>) => void;
  phase: RunPhase;
  hasCredential: boolean;
  verificationStatus?: VerificationStatus;
  sandboxFallback: boolean;
}

type ColumnStatus = 'standby' | 'active' | 'holding' | 'done' | 'rejected' | 'failed';

const STATUS_STYLE: Record<ColumnStatus, { label: string; className: string; Icon: LucideIcon; spin?: boolean }> = {
  standby: { label: 'Standby', className: 'text-slate-400 bg-slate-800/60 border-slate-700', Icon: Circle },
  active: { label: 'In progress', className: 'text-sky-300 bg-sky-500/10 border-sky-500/40', Icon: Loader2, spin: true },
  holding: { label: 'Holding VC', className: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/40', Icon: WalletIcon },
  done: { label: 'Done', className: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/40', Icon: CheckCircle2 },
  rejected: { label: 'Rejected', className: 'text-rose-300 bg-rose-500/10 border-rose-500/40', Icon: ShieldAlert },
  failed: { label: 'Error', className: 'text-rose-300 bg-rose-500/10 border-rose-500/40', Icon: XCircle }
};

/** Derive each role's live status from the run phase. */
const columnStatus = (role: NodeRole, phase: RunPhase, hasCredential: boolean, verification?: VerificationStatus): ColumnStatus => {
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
  issuer: { step: 1, title: 'Issuer Node', protocol: 'OpenID4VCI', Icon: Landmark },
  wallet: { step: 2, title: 'Identity Wallet', protocol: 'Holder Agent', Icon: WalletIcon },
  verifier: { step: 3, title: 'Verifier Node', protocol: 'OpenID4VP', Icon: CheckCircle2 }
};

// Tailwind needs literal class names, so accent colours are spelled out per role.
const ACCENT_TEXT: Record<NodeRole, string> = { issuer: 'text-sky-400', wallet: 'text-indigo-400', verifier: 'text-emerald-400' };
const ACCENT_CHIP: Record<NodeRole, string> = {
  issuer: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  wallet: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  verifier: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
};
const ACCENT_RING: Record<NodeRole, string> = {
  issuer: 'border-sky-500 bg-sky-500/10 ring-1 ring-sky-500',
  wallet: 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500',
  verifier: 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500'
};

const StatusBadge: React.FC<{ status: ColumnStatus; detail?: string }> = ({ status, detail }) => {
  const { label, className, Icon, spin } = STATUS_STYLE[status];
  return (
    <span aria-live="polite" className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${className}`}>
      <Icon className={`h-3 w-3 ${spin ? 'animate-spin' : ''}`} />
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
  sandboxFallback: boolean;
}

function RoleColumn<Id extends string>({ role, nodes, selectedId, onPick, status, statusDetail, locked, format, sandboxFallback }: RoleColumnProps<Id>) {
  const meta = ROLE_META[role];
  return (
    <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className={`h-8 w-8 rounded-lg bg-slate-800/60 ${ACCENT_TEXT[role]} flex items-center justify-center font-bold`}>
            {meta.step}
          </div>
          <span className="text-sm font-semibold text-slate-200 uppercase tracking-wider">{meta.title}</span>
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${ACCENT_CHIP[role]}`}>{meta.protocol}</span>
      </div>

      <div className="mb-3">
        <StatusBadge status={status} detail={statusDetail} />
      </div>

      <div role="radiogroup" aria-label={meta.title} className="space-y-3 flex-1">
        {nodes.map(node => {
          const selected = node.id === selectedId;
          const unsupported = !node.supportedFormats.includes(format);
          const NodeIcon = node.isMosip ? meta.Icon : ShieldAlert;
          return (
            <button
              key={node.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={locked || unsupported}
              onClick={() => onPick(node.id)}
              className={`w-full text-left p-3.5 rounded-xl border transition-all disabled:cursor-not-allowed ${
                selected ? ACCENT_RING[role] : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/40 text-slate-400'
              } ${unsupported ? 'opacity-40' : ''} ${locked && !selected ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-white text-sm flex items-center gap-2">
                  <NodeIcon className={`h-4 w-4 ${node.isMosip ? ACCENT_TEXT[role] : 'text-amber-400'}`} />
                  {node.label}
                </div>
                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm ${
                  node.isMosip ? 'bg-slate-800 text-slate-200' : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {selected && node.isMosip && sandboxFallback ? 'Emulated' : node.badge}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">{node.description}</p>
              {unsupported && <p className="text-[11px] text-amber-300 mt-1">Does not support the selected format</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const Connector: React.FC<{ lit: boolean }> = ({ lit }) => (
  <div className="hidden md:flex items-center justify-center" aria-hidden="true">
    <ChevronRight className={`h-6 w-6 transition-colors ${lit ? 'text-emerald-400' : 'text-slate-700'}`} />
  </div>
);

export const MatrixSelector: React.FC<MatrixSelectorProps> = ({
  selection,
  onSelect,
  phase,
  hasCredential,
  verificationStatus,
  sandboxFallback
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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl mb-6">
      {/* Credential Format Toggle Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 mb-6 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-sky-400" />
            Interoperability Matrix Configurator
          </h2>
          <p className="text-xs text-slate-400">
            Select standards endpoints and verifiable credential format to test cross-ecosystem behavior.
          </p>
        </div>

        <div role="radiogroup" aria-label="Credential format" className="flex flex-wrap items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
          <span className="text-slate-400 px-2 flex items-center gap-1.5">
            <FileCode2 className="h-3.5 w-3.5" /> Spec Format:
          </span>
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
                className={`px-3 py-1.5 rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                  active ? 'bg-sky-600 text-white font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.label} <span className="font-mono opacity-70">{f.wireFormat}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3-Column Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-4 md:gap-2">
        <RoleColumn
          role="issuer"
          nodes={ISSUERS}
          selectedId={selection.issuer}
          onPick={issuer => onSelect({ issuer })}
          status={statuses.issuer}
          locked={locked}
          format={selection.format}
          sandboxFallback={sandboxFallback}
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
          sandboxFallback={sandboxFallback}
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
          sandboxFallback={sandboxFallback}
        />
      </div>
    </div>
  );
};
