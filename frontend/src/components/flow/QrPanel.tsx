import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy } from 'lucide-react';
import { QR_MAX_BYTES } from '../../lib/credential';

/** Scannable QR plus copy / same-device link for an OpenID4VC request URI. */
export const QrPanel: React.FC<{ title: string; uri: string }> = ({ title, uri }) => {
  const [copied, setCopied] = useState(false);
  const fits = new TextEncoder().encode(uri).length <= QR_MAX_BYTES;
  const copy = () => {
    navigator.clipboard?.writeText(uri).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="p-3 mb-4 rounded-lg bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-start gap-3">
      {fits ? (
        <div className="p-2 bg-white rounded-md shrink-0">
          <QRCodeSVG value={uri} size={132} level="L" />
        </div>
      ) : (
        <div className="p-3 rounded-md border border-amber-500/40 bg-amber-950/20 text-[11px] text-amber-200 w-full sm:w-36 shrink-0">
          Payload exceeds QR capacity ({QR_MAX_BYTES} bytes). Use the deep link or request_uri by reference.
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-white">{title}</div>
        <div className="text-[11px] text-slate-400 font-mono break-all line-clamp-4 mt-1">{uri}</div>
        <div className="flex gap-2 mt-2">
          <button type="button" onClick={copy} className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 flex items-center gap-1">
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <a href={uri} className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200">
            Open on this device
          </a>
        </div>
      </div>
    </div>
  );
};
