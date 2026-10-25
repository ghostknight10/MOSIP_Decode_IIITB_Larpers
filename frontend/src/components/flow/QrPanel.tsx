import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy } from 'lucide-react';
import { QR_MAX_BYTES } from '../../lib/credential';
import { btnSmall } from '../ui';

/**
 * Scannable QR plus copy / same-device link for an OpenID4VC request URI.
 * When the by-value URI is too large for a QR code and a by-reference URI is
 * available (G-1), the QR and links use that instead.
 */
export const QrPanel: React.FC<{ title: string; uri: string; referenceUri?: string }> = ({ title, uri: byValue, referenceUri }) => {
  // Cross-device signposting (Korir et al., SOUPS 2022): say which device does
  // what. A QR on the phone you are holding cannot be scanned, so small screens
  // lead with the same-device link instead.
  const [copied, setCopied] = useState(false);
  const fitsByValue = new TextEncoder().encode(byValue).length <= QR_MAX_BYTES;
  const byReference = !fitsByValue && Boolean(referenceUri);
  const uri = byReference ? referenceUri! : byValue;
  const fits = new TextEncoder().encode(uri).length <= QR_MAX_BYTES;
  const copy = () => {
    navigator.clipboard?.writeText(uri).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="p-3 mb-4 rounded-md bg-surface border border-line flex flex-col sm:flex-row items-start gap-3">
      {fits ? (
        <div className="hidden sm:block p-2 bg-surface border border-line rounded shrink-0">
          <QRCodeSVG value={uri} size={132} level="L" />
        </div>
      ) : (
        <div className="p-3 rounded-md border border-warning-line bg-warning-soft text-xs text-warning-ink w-full sm:w-36 shrink-0">
          Payload exceeds QR capacity ({QR_MAX_BYTES} bytes). Use the deep link or request_uri by reference.
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink">{title}</div>
        {byReference && <p className="text-xs text-ink-muted mt-1">Too large for a QR code by value, so it is passed by reference.</p>}
        <p className="text-xs text-ink-muted mt-1">
          <span className="hidden sm:inline">Scan with the wallet app on your phone, or open the link if the wallet runs on this device.</span>
          <span className="sm:hidden">Open the link with the wallet app on this phone.</span>
        </p>
        {/* line-clamp needs display:-webkit-box, so it sits inside the responsive wrapper. */}
        <div className="hidden sm:block mt-1">
          <div className="text-xs text-ink-subtle font-mono break-all line-clamp-3">{uri}</div>
        </div>
        <div className="flex gap-2 mt-2">
          <button type="button" onClick={copy} className={btnSmall}>
            {copied ? <Check className="h-3 w-3 text-success-ink" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <a href={uri} className={btnSmall}>
            Open on this device
          </a>
        </div>
      </div>
    </div>
  );
};
