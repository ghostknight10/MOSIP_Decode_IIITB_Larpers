import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { encodeForQr, QrEncoding } from '../../lib/pixelpass';
import { QR_MAX_BYTES } from '../../lib/credential';
import { btnSmall } from '../ui';

/**
 * The issued credential as a QR code in MOSIP's PixelPass encoding (zlib +
 * base45, CBOR for JSON), which Inji Verify's QR scanner reads. Shows how much
 * the encoding saves, since credential size against QR capacity is a known
 * interoperability limit (G-1).
 */
export const CredentialQr: React.FC<{ credential: unknown }> = ({ credential }) => {
  const [open, setOpen] = useState(false);
  const [encoding, setEncoding] = useState<QrEncoding | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setEncoding(null);
    setError(false);
    encodeForQr(credential).then(
      result => live && setEncoding(result),
      () => live && setError(true)
    );
    return () => {
      live = false;
    };
  }, [open, credential]);

  const copy = () => {
    if (!encoding) return;
    navigator.clipboard?.writeText(encoding.data).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mb-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="text-xs text-ink-muted hover:text-ink flex items-center gap-1"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Credential as a QR code (PixelPass)
      </button>
      {open && (
        <div className="mt-2 p-3 rounded-md bg-surface border border-line flex flex-col sm:flex-row items-start gap-3">
          {error && <p className="text-xs text-danger-ink">The credential could not be encoded.</p>}
          {!encoding && !error && <p className="text-xs text-ink-muted">Encoding…</p>}
          {encoding && (
            <>
              {encoding.fits ? (
                <div className="p-2 bg-white border border-line rounded shrink-0" data-testid="credential-qr">
                  <QRCodeSVG value={encoding.data} size={160} level="L" />
                </div>
              ) : (
                <div className="p-3 rounded-md border border-warning-line bg-warning-soft text-xs text-warning-ink w-full sm:w-40 shrink-0">
                  Still too big for one QR code ({QR_MAX_BYTES} bytes) after compression. Share it as a file or by reference.
                </div>
              )}
              <div className="flex-1 min-w-0 text-xs text-ink-muted space-y-1.5">
                <p>
                  <span className="font-mono text-ink">{encoding.rawBytes}</span> bytes as issued →{' '}
                  <span className="font-mono text-ink">{encoding.encodedBytes}</span> bytes with PixelPass
                  {encoding.rawBytes > 0 && <> ({Math.round((1 - encoding.encodedBytes / encoding.rawBytes) * 100)}% {encoding.encodedBytes <= encoding.rawBytes ? 'smaller' : 'larger'})</>}.
                </p>
                <p>Inji Verify's <span className="font-medium text-ink">Scan QR Code</span> reads this encoding.</p>
                <button type="button" onClick={copy} className={btnSmall}>
                  {copied ? <Check className="h-3 w-3 text-success-ink" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy encoded text'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
