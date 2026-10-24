import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, HelpCircle, XCircle } from 'lucide-react';
import { CredentialFormat } from '../../types';
import { JsonView } from '../../lib/jsonHighlight';
import { parseSdJwt, ParsedSdJwt, verifyDisclosureDigests } from '../../lib/sdjwt';

/**
 * "Inspect credential": decodes what the wallet received. SD-JWTs are split
 * into labelled parts with per-disclosure digest checks (iGrant / jwt.io
 * pattern); W3C credentials show subject claims and the proof.
 */

// Each segment gets a colour *and* a text label in the legend and tables.
const SEGMENT = {
  header: { label: 'Header', cls: 'text-rose-300' },
  payload: { label: 'Payload', cls: 'text-violet-300' },
  signature: { label: 'Signature', cls: 'text-sky-300' },
  disclosure: { label: 'Disclosures', cls: 'text-emerald-300' }
};

const DigestCell: React.FC<{ result: boolean | 'unavailable' | undefined }> = ({ result }) => {
  if (result === undefined) return <span className="text-slate-400">Checking…</span>;
  if (result === 'unavailable')
    return (
      <span className="inline-flex items-center gap-1 text-slate-400" title="WebCrypto needs a secure context (https or localhost)">
        <HelpCircle className="h-3.5 w-3.5" /> Unavailable
      </span>
    );
  return result ? (
    <span className="inline-flex items-center gap-1 text-emerald-300">
      <CheckCircle2 className="h-3.5 w-3.5" /> Yes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-rose-300">
      <XCircle className="h-3.5 w-3.5" /> No
    </span>
  );
};

const SdJwtView: React.FC<{ raw: string }> = ({ raw }) => {
  const parsed: ParsedSdJwt | null = parseSdJwt(raw);
  const [digests, setDigests] = useState<boolean[] | 'unavailable' | null>(null);

  useEffect(() => {
    let live = true;
    setDigests(null);
    if (parsed) verifyDisclosureDigests(parsed).then(r => live && setDigests(r));
    return () => {
      live = false;
    };
  }, [raw]); // parsed is derived from raw

  if (!parsed) return <p className="text-xs text-rose-300">The SD-JWT could not be decoded.</p>;
  const [h, p] = parsed.jwt.split('.');
  const digestFor = (i: number) => (digests === null ? undefined : digests === 'unavailable' ? 'unavailable' : digests[i]);

  return (
    <div className="space-y-3">
      <div>
        <p aria-label="Encoded SD-JWT" className="font-mono text-xs break-all p-2 rounded-md bg-slate-950 border border-slate-800">
          <span className={SEGMENT.header.cls}>{h}</span>.<span className={SEGMENT.payload.cls}>{p}</span>.
          <span className={SEGMENT.signature.cls}>{parsed.signature}</span>
          {parsed.disclosures.map(d => (
            <React.Fragment key={d.raw}>
              ~<span className={SEGMENT.disclosure.cls}>{d.raw}</span>
            </React.Fragment>
          ))}
          ~
        </p>
        <ul aria-label="Token parts" className="flex flex-wrap gap-3 mt-1.5 text-xs">
          {Object.values(SEGMENT).map(s => (
            <li key={s.label} className={s.cls}>
              ■ <span className="text-slate-300">{s.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <section aria-label="Header">
          <h5 className="text-xs font-semibold text-slate-300 mb-1">Header</h5>
          <JsonView value={parsed.header} className="p-2 rounded-md bg-slate-950 border border-slate-800" />
        </section>
        <section aria-label="Payload">
          <h5 className="text-xs font-semibold text-slate-300 mb-1">Payload</h5>
          <JsonView value={parsed.payload} className="p-2 rounded-md bg-slate-950 border border-slate-800 max-h-48 overflow-auto" />
        </section>
      </div>

      <section aria-label="Disclosures">
        <h5 className="text-xs font-semibold text-slate-300 mb-1">Disclosures ({parsed.disclosures.length})</h5>
        {parsed.disclosures.length === 0 ? (
          <p className="text-xs text-slate-400">No selectively disclosable claims.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-800">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400">
                <tr>
                  <th className="p-2">Claim</th>
                  <th className="p-2">Value</th>
                  <th className="p-2">Salt</th>
                  <th className="p-2">Digest in _sd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {parsed.disclosures.map((d, i) => (
                  <tr key={d.raw}>
                    <td className="p-2 font-mono">{d.error ? <span className="text-rose-300">{d.error}</span> : d.name ?? '(array element)'}</td>
                    <td className="p-2 font-mono break-all">{d.error ? '' : JSON.stringify(d.value)}</td>
                    <td className="p-2 font-mono text-slate-400">{d.salt ?? ''}</td>
                    <td className="p-2">
                      <DigestCell result={digestFor(i)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {Array.isArray(digests) && digests.some(ok => !ok) && (
          <p className="mt-1.5 text-xs text-amber-300">
            Some disclosures are not committed in the payload's <code>_sd</code> digests, so a strict verifier must reject them.
          </p>
        )}
      </section>

      {parsed.keyBinding && (
        <section aria-label="Key binding">
          <h5 className="text-xs font-semibold text-slate-300 mb-1">Key binding JWT</h5>
          <JsonView value={parsed.keyBinding} className="p-2 rounded-md bg-slate-950 border border-slate-800" />
        </section>
      )}
    </div>
  );
};

const W3cView: React.FC<{ credential: any }> = ({ credential }) => {
  const { id: _holder, ...claims } = credential?.credentialSubject ?? {};
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-slate-500">@context</dt>
        <dd className="font-mono text-slate-200 break-all">{[].concat(credential?.['@context'] ?? []).join(', ') || '—'}</dd>
        <dt className="text-slate-500">Holder</dt>
        <dd className="font-mono text-slate-200 break-all">{credential?.credentialSubject?.id ?? '—'}</dd>
      </dl>
      <section aria-label="Subject claims">
        <h5 className="text-xs font-semibold text-slate-300 mb-1">Subject claims ({Object.keys(claims).length})</h5>
        <div className="overflow-x-auto rounded-md border border-slate-800">
          <table className="w-full text-xs text-left">
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {Object.entries(claims).map(([k, v]) => (
                <tr key={k}>
                  <th scope="row" className="p-2 font-mono font-normal text-slate-400">{k}</th>
                  <td className="p-2 font-mono break-all">{JSON.stringify(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-label="Proof">
        <h5 className="text-xs font-semibold text-slate-300 mb-1">Proof</h5>
        <JsonView value={credential?.proof ?? null} className="p-2 rounded-md bg-slate-950 border border-slate-800" />
      </section>
    </div>
  );
};

export const CredentialInspector: React.FC<{ credential: any; format: CredentialFormat }> = ({ credential, format }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="text-xs text-slate-300 hover:text-white flex items-center gap-1"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Inspect credential
      </button>
      {open && (
        <div className="mt-2 p-3 rounded-lg bg-slate-900 border border-slate-800">
          {format === 'sd-jwt' && typeof credential?.rawToken === 'string' ? <SdJwtView raw={credential.rawToken} /> : <W3cView credential={credential} />}
        </div>
      )}
    </div>
  );
};
