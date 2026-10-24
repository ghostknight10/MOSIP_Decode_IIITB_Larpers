import React from 'react';
import { IssuerType, WalletType, VerifierType, CredentialFormat, RunPhase } from '../types';
import { Landmark, Wallet as WalletIcon, CheckCircle2, ShieldAlert, Sparkles, FileCode2 } from 'lucide-react';

interface MatrixSelectorProps {
  issuer: IssuerType;
  setIssuer: (val: IssuerType) => void;
  wallet: WalletType;
  setWallet: (val: WalletType) => void;
  verifier: VerifierType;
  setVerifier: (val: VerifierType) => void;
  format: CredentialFormat;
  setFormat: (val: CredentialFormat) => void;
  flowState: RunPhase;
}

export const MatrixSelector: React.FC<MatrixSelectorProps> = ({
  issuer,
  setIssuer,
  wallet,
  setWallet,
  verifier,
  setVerifier,
  format,
  setFormat,
  flowState
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl mb-6">
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

        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
          <span className="text-slate-400 px-2 flex items-center gap-1.5">
            <FileCode2 className="h-3.5 w-3.5" /> Spec Format:
          </span>
          <button
            onClick={() => setFormat('w3c-vc')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              format === 'w3c-vc'
                ? 'bg-sky-500 text-white font-semibold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            W3C VC (JSON-LD)
          </button>
          <button
            onClick={() => setFormat('sd-jwt')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              format === 'sd-jwt'
                ? 'bg-indigo-500 text-white font-semibold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            SD-JWT VC (Selective Disclosure)
          </button>
        </div>
      </div>

      {/* 3-Column Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: ISSUER */}
        <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center font-bold">
                1
              </div>
              <span className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
                Issuer Node
              </span>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">
              OpenID4VCI
            </span>
          </div>

          <div className="space-y-3 flex-1">
            <button
              type="button"
              onClick={() => setIssuer('inji-certify')}
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                issuer === 'inji-certify'
                  ? 'border-sky-500 bg-sky-500/10 ring-1 ring-sky-500'
                  : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/40 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-white text-sm flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-sky-400" />
                  Inji Certify
                </div>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">
                  MOSIP Collab
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Official MOSIP issuance module supporting pre-authorized credential offers.
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                Status: {issuer === 'inji-certify' ? 'Selected' : 'Standby'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setIssuer('mock-openid4vci')}
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                issuer === 'mock-openid4vci'
                  ? 'border-sky-500 bg-sky-500/10 ring-1 ring-sky-500'
                  : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/40 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-white text-sm flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-400" />
                  Mock OpenID4VCI
                </div>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                  Custom Spec
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Self-hosted OID4VCI (Draft 13) mock for simulating edge cases and negative signatures.
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                <span className={`h-1.5 w-1.5 rounded-full ${issuer === 'mock-openid4vci' ? 'bg-sky-400' : 'bg-slate-600'}`}></span>
                Status: {issuer === 'mock-openid4vci' ? 'Selected' : 'Standby'}
              </div>
            </button>
          </div>
        </div>

        {/* Column 2: WALLET */}
        <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold">
                2
              </div>
              <span className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
                Identity Wallet
              </span>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
              Holder Agent
            </span>
          </div>

          <div className="space-y-3 flex-1">
            <button
              type="button"
              onClick={() => setWallet('inji-wallet')}
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                wallet === 'inji-wallet'
                  ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500'
                  : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/40 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-white text-sm flex items-center gap-2">
                  <WalletIcon className="h-4 w-4 text-indigo-400" />
                  Inji Web / Mobile
                </div>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                  MOSIP Mimoto
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                MOSIP Inji reference wallet with biometric secure enclave and multi-format vault.
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                Status: {wallet === 'inji-wallet' ? 'Connected' : 'Standby'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setWallet('mock-wallet')}
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                wallet === 'mock-wallet'
                  ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500'
                  : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/40 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-white text-sm flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-indigo-300" />
                  Simulated Holder
                </div>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                  Headless
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Headless software wallet running in playground browser for automated assertions.
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                <span className={`h-1.5 w-1.5 rounded-full ${wallet === 'mock-wallet' ? 'bg-indigo-400' : 'bg-slate-600'}`}></span>
                Status: {wallet === 'mock-wallet' ? 'Selected' : 'Standby'}
              </div>
            </button>
          </div>
        </div>

        {/* Column 3: VERIFIER */}
        <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                3
              </div>
              <span className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
                Verifier Node
              </span>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              OpenID4VP
            </span>
          </div>

          <div className="space-y-3 flex-1">
            <button
              type="button"
              onClick={() => setVerifier('inji-verify')}
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                verifier === 'inji-verify'
                  ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500'
                  : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/40 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-white text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Inji Verify
                </div>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  MOSIP Collab
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                MOSIP Inji Verifier verifying cryptographic trust chains and trust registries.
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                Status: {verifier === 'inji-verify' ? 'Selected' : 'Standby'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setVerifier('mock-openid4vp')}
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                verifier === 'mock-openid4vp'
                  ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500'
                  : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/40 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-white text-sm flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-emerald-300" />
                  Mock OpenID4VP
                </div>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                  Custom Spec
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Self-hosted OID4VP (Draft 21) verifier evaluating presentation definitions.
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                <span className={`h-1.5 w-1.5 rounded-full ${verifier === 'mock-openid4vp' ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                Status: {verifier === 'mock-openid4vp' ? 'Selected' : 'Standby'}
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
