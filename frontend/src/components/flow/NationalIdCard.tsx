import React, { useState } from 'react';
import { CredentialFormat } from '../../types';
import { extractSubjectAttributes } from '../../lib/credential';
import { ShieldCheck, Smartphone, X, User, Cpu, Wifi } from 'lucide-react';
import { btnSecondary, btnSmall } from '../ui';

interface NationalIdCardProps {
  credential: any;
  format: CredentialFormat;
}

export const NationalIdCard: React.FC<NationalIdCardProps> = ({ credential, format }) => {
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const attrs = extractSubjectAttributes(credential, format);

  const fullName = attrs.fullName || attrs.name || 'Aaditya Sharma';
  const nationalId = attrs.nationalId || attrs.UIN || 'MOSIP-IND-9876-5432-1098';
  const dob = attrs.dob || attrs.dateOfBirth || '1995-08-15';
  const country = attrs.country || 'IND';
  const formatLabel = format === 'w3c-vc' ? 'W3C VC (JSON-LD)' : format === 'sd-jwt' ? 'IETF SD-JWT' : 'ISO 18013-5 mDoc';

  const cardContent = (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 shadow-lg border border-indigo-500/30 font-sans select-none">
      {/* Background Watermark Pattern */}
      <div className="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
      <div className="absolute right-4 top-4 opacity-15">
        <ShieldCheck className="w-24 h-24 text-indigo-300" />
      </div>

      {/* Card Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center font-bold text-xs text-white shadow">
            M
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-indigo-300 font-semibold">MOSIP Ecosystem</div>
            <div className="text-xs font-bold tracking-wide text-white">National Digital Identity</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-indigo-300">
          <Wifi className="w-4 h-4 rotate-90" aria-label="Contactless" />
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-900/60 border border-indigo-400/30 text-indigo-200">
            {formatLabel}
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div className="flex gap-4 items-center">
        {/* Photo Avatar */}
        <div className="relative shrink-0">
          <div className="w-16 h-20 sm:w-20 sm:h-24 rounded-lg bg-slate-800 border-2 border-indigo-400/40 flex flex-col items-center justify-center overflow-hidden shadow-inner">
            <User className="w-10 h-10 text-indigo-200" />
            <div className="absolute bottom-0 inset-x-0 bg-indigo-950/80 text-[8px] text-center text-indigo-300 py-0.5 font-mono">
              VERIFIED
            </div>
          </div>
          <div className="absolute -bottom-1 -right-1 bg-amber-400 text-slate-900 rounded p-0.5 shadow" title="Security Microchip">
            <Cpu className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Identity Details */}
        <div className="flex-1 min-w-0 space-y-1">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-medium">Full Name</div>
            <div className="text-sm sm:text-base font-bold text-white tracking-wide truncate">{fullName}</div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-medium">National ID / UIN</div>
              <div className="text-xs font-mono font-semibold text-indigo-200 truncate">{nationalId}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-medium">Date of Birth</div>
              <div className="text-xs font-mono text-slate-200">{dob}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-0.5 text-[10px] text-slate-400">
            <div>Country: <span className="font-semibold text-white">{country}</span></div>
            <div>Status: <span className="text-emerald-400 font-semibold">● ACTIVE</span></div>
          </div>
        </div>
      </div>

      {/* Card Footer */}
      <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
        <div className="flex items-center gap-1 text-emerald-400 font-medium">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Cryptographically Signed</span>
        </div>
        <div className="font-mono text-[9px] text-slate-500">
          MOSIP · OpenID4VCI
        </div>
      </div>
    </div>
  );

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-accent" />
          Issued Identity Card
        </span>
        <button
          type="button"
          onClick={() => setShowPhoneModal(true)}
          className={`${btnSmall} flex items-center gap-1 text-accent border-accent/40 hover:bg-accent/10`}
          title="Open simulated mobile wallet holder view"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Mobile Wallet View</span>
        </button>
      </div>

      {/* Render ID Card */}
      {cardContent}

      {/* Simulated Smartphone Modal */}
      {showPhoneModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Wallet Simulator"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setShowPhoneModal(false)}
        >
          <div
            className="relative w-full max-w-[340px] bg-slate-950 rounded-[40px] p-3 shadow-2xl border-4 border-slate-700"
            onClick={e => e.stopPropagation()}
          >
            {/* Phone Speaker Notch */}
            <div className="w-24 h-4 bg-slate-800 rounded-full mx-auto mb-2 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-900 mr-2" />
              <div className="w-8 h-1 rounded-full bg-slate-700" />
            </div>

            {/* Phone Screen Area */}
            <div className="rounded-[28px] bg-slate-900 border border-slate-800 p-3 min-h-[460px] flex flex-col justify-between text-white">
              {/* Phone Status Bar */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-2 pb-2 border-b border-slate-800 font-mono">
                <span>9:41</span>
                <span className="text-[10px] font-sans font-medium text-indigo-400">Inji Mobile Wallet</span>
                <span>100% 🔋</span>
              </div>

              {/* Wallet App Header */}
              <div className="my-3 px-1">
                <div className="text-xs text-slate-400">Holder Wallet</div>
                <div className="text-base font-bold text-white flex items-center gap-1.5">
                  <span>My Identity Cards</span>
                  <span className="text-xs px-1.5 py-0.2 rounded bg-indigo-600/60 text-indigo-200">1</span>
                </div>
              </div>

              {/* Card inside mobile wallet */}
              <div className="my-auto">
                {cardContent}
              </div>

              {/* Wallet Actions inside phone */}
              <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                <div className="text-center text-[11px] text-slate-400">
                  Ready for OpenID4VP Presentation
                </div>
                <button
                  type="button"
                  onClick={() => setShowPhoneModal(false)}
                  className={`w-full ${btnSecondary} justify-center text-xs text-white bg-slate-800 hover:bg-slate-700 border-slate-600`}
                >
                  Close Phone View
                </button>
              </div>
            </div>

            {/* Close button on outer modal */}
            <button
              type="button"
              onClick={() => setShowPhoneModal(false)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-slate-800 border border-slate-600 text-white flex items-center justify-center shadow-lg hover:bg-slate-700"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
