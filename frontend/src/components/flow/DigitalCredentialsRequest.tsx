import React, { useState } from 'react';
import { MonitorSmartphone } from 'lucide-react';
import { digitalCredentialsSupported, DcRequestParams, DcResponse, explainDcError, requestViaDigitalCredentialsApi } from '../../lib/digitalCredentials';
import { btnSmall } from '../ui';
import { JsonView } from '../../lib/jsonHighlight';

/**
 * Same-device OpenID4VP through the browser's Digital Credentials API, next to
 * the QR code and deep link. Shows the wallet's raw answer; the playground's
 * verifiers expect the vp_token over their own response endpoint, so this
 * demonstrates the request side of the flow.
 */
export const DigitalCredentialsRequest: React.FC<DcRequestParams> = params => {
  const [state, setState] = useState<{ status: 'idle' | 'waiting' } | { status: 'done'; response: DcResponse } | { status: 'error'; message: string }>({ status: 'idle' });
  const supported = digitalCredentialsSupported();

  const request = async () => {
    setState({ status: 'waiting' });
    try {
      setState({ status: 'done', response: await requestViaDigitalCredentialsApi(params) });
    } catch (error) {
      setState({ status: 'error', message: explainDcError(error) });
    }
  };

  return (
    <div className="p-3 mb-4 rounded-md bg-surface border border-line text-xs">
      <div className="text-sm font-medium text-ink flex items-center gap-1.5">
        <MonitorSmartphone className="h-4 w-4 text-accent" aria-hidden="true" />
        Same-device request (Digital Credentials API)
      </div>
      <p className="text-ink-muted mt-1">
        {supported
          ? 'Asks a wallet on this device to present, through the browser, with no QR code. Experimental.'
          : 'Not available in this browser. It needs the W3C Digital Credentials API (Chrome 141 or newer) and a wallet on the device that supports OpenID4VP. Use the QR code or the link above instead.'}
      </p>
      <div className="mt-2">
        <button type="button" onClick={request} disabled={!supported || state.status === 'waiting'} className={`${btnSmall} disabled:opacity-50 disabled:cursor-not-allowed`}>
          {state.status === 'waiting' ? 'Waiting for the wallet…' : 'Request with the browser'}
        </button>
      </div>
      {state.status === 'error' && <p role="alert" className="mt-2 text-danger-ink">{state.message}</p>}
      {state.status === 'done' && (
        <div className="mt-2" aria-label="Wallet response">
          <div className="text-ink-muted mb-1">
            The wallet answered over <span className="font-mono">{state.response.protocol}</span>:
          </div>
          <JsonView value={state.response.data} className="p-2 rounded-md bg-surface-muted border border-line max-h-40 overflow-auto" />
        </div>
      )}
    </div>
  );
};
