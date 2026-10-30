import React, { useState } from 'react';
import { CredentialFormat } from '../../types';
import { extractSubjectAttributes } from '../../lib/credential';
import { ShieldCheck, Smartphone, User, X } from 'lucide-react';
import { btnSecondary, btnSmall } from '../ui';

interface NationalIdCardProps {
  credential: any;
  format: CredentialFormat;
}

const FORMAT_LABEL: Record<CredentialFormat, string> = {
  'w3c-vc': 'W3C VC (JSON-LD)',
  'sd-jwt': 'IETF SD-JWT',
  'mso-mdoc': 'ISO 18013-5 mDoc'
};

const Field: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="min-w-0">
    <div className="text-xs text-ink-subtle">{label}</div>
    <div className={`text-sm text-ink truncate ${mono ? 'font-mono' : 'font-medium'}`}>{value}</div>
  </div>
);

/**
 * The credential's claims drawn as an ID card, plus a simulated phone wallet
 * view. A rendering only: it shows the claims the credential carries (a dash
 * where it carries none) and says nothing about whether it was verified.
 */
export const NationalIdCard: React.FC<NationalIdCardProps> = ({ credential, format }) => {
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const attrs = extractSubjectAttributes(credential, format);

  const fullName = attrs.fullName || attrs.name || '—';
  const nationalId = attrs.nationalId || attrs.UIN || '—';
  const dob = attrs.dob || attrs.dateOfBirth || '—';
  const country = attrs.country || '—';

  const cardContent = (
    <div className="rounded-md border border-line bg-surface select-none">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-line bg-accent-soft">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 shrink-0 rounded bg-accent flex items-center justify-center text-xs font-semibold text-on-accent">M</div>
          <div className="min-w-0">
            <div className="text-xs text-ink-muted">MOSIP ecosystem</div>
            <div className="text-sm font-semibold text-ink truncate">National digital identity</div>
          </div>
        </div>
        <span className="text-xs font-mono px-1.5 py-0.5 rounded border border-line bg-surface text-ink-muted whitespace-nowrap">
          {FORMAT_LABEL[format]}
        </span>
      </div>

      <div className="flex gap-4 items-center p-4">
        <div className="h-20 w-16 shrink-0 rounded border border-line bg-surface-muted flex items-center justify-center" aria-hidden="true">
          <User className="h-9 w-9 text-ink-subtle" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <Field label="Full name" value={fullName} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="National ID / UIN" value={nationalId} mono />
            <Field label="Date of birth" value={dob} mono />
          </div>
          <Field label="Country" value={country} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-line text-xs text-ink-muted">
        <span className="flex items-center gap-1 text-success-ink font-medium">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Cryptographically Signed
        </span>
        <span className="font-mono">MOSIP · OpenID4VCI</span>
      </div>
    </div>
  );

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
          Issued identity card
        </span>
        <button
          type="button"
          onClick={() => setShowPhoneModal(true)}
          className={btnSmall}
          title="Open simulated mobile wallet holder view"
        >
          <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Mobile Wallet View</span>
        </button>
      </div>

      {cardContent}

      {showPhoneModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Wallet Simulator"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/50"
          onClick={() => setShowPhoneModal(false)}
        >
          <div
            className="relative w-full max-w-[340px] rounded-md border-2 border-line-strong bg-surface-muted p-3 shadow-sm"
            onClick={e => e.stopPropagation()}
          >
            <div className="rounded-md border border-line bg-canvas p-3 min-h-[440px] flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-ink-muted px-1 pb-2 border-b border-line font-mono">
                <span>9:41</span>
                <span className="font-sans font-medium text-accent">Inji Mobile Wallet</span>
                <span>100%</span>
              </div>

              <div className="my-3 px-1">
                <div className="text-xs text-ink-muted">Holder wallet</div>
                <div className="text-base font-semibold text-ink flex items-center gap-1.5">
                  <span>My identity cards</span>
                  <span className="text-xs px-1.5 rounded border border-line bg-surface text-ink-muted">1</span>
                </div>
              </div>

              <div className="my-auto">{cardContent}</div>

              <div className="mt-4 pt-3 border-t border-line space-y-2">
                <div className="text-center text-xs text-ink-muted">Ready for OpenID4VP presentation</div>
                <button type="button" onClick={() => setShowPhoneModal(false)} className={`w-full ${btnSecondary}`}>
                  Close Phone View
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowPhoneModal(false)}
              className="absolute -top-3 -right-3 h-8 w-8 rounded-full border border-line-strong bg-surface text-ink flex items-center justify-center hover:bg-surface-muted transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
