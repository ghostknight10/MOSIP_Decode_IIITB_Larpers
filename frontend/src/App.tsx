import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { MatrixSelector } from './components/MatrixSelector';
import { FlowControls } from './components/FlowControls';
import { ProtocolInspector } from './components/ProtocolInspector';
import { SequenceDiagram } from './components/SequenceDiagram';
import { InteropMatrixReport } from './components/InteropMatrixReport';
import { usePlaygroundRun } from './hooks/usePlaygroundRun';
import { api } from './api/client';
import { allCombinations, DEFAULT_SUBJECT } from './config/nodes';
import { fallbackNotice } from './lib/fallback';
import { AlertTriangle, Info } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'playground' | 'matrix'>('playground');
  const [serverConnected, setServerConnected] = useState<boolean | null>(null);
  const run = usePlaygroundRun();
  const { selection } = run;
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const emulatedNotice = fallbackNotice(selection, run.issueFallback, run.verifyFallback);

  const handleRunAll = async () => {
    const combos = allCombinations();
    setBatchProgress({ done: 0, total: combos.length });
    try {
      await run.runBatch(combos, DEFAULT_SUBJECT, (done, total) => setBatchProgress({ done, total }));
    } finally {
      setBatchProgress(null);
    }
  };

  // Check BFF health on load and every 15s so the header reflects backend restarts
  useEffect(() => {
    const check = () => api.health().then(() => setServerConnected(true)).catch(() => setServerConnected(false));
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      <Header
        serverConnected={serverConnected}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        runCount={run.history.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {activeTab === 'playground' ? (
          <div>
            {/* 3-Column Matrix Configurator */}
            <MatrixSelector
              selection={selection}
              onSelect={run.select}
              phase={run.phase}
              hasCredential={Boolean(run.issuedCredential)}
              verificationStatus={run.verificationResult?.status}
              emulated={{ issuer: run.issueFallback, wallet: run.sandboxFallback, verifier: run.verifyFallback }}
            />

            {run.error && (
              <div role="alert" className="mb-6 p-3 rounded-xl border border-rose-500/40 bg-rose-950/30 text-rose-200 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                {run.error}
              </div>
            )}
            {emulatedNotice && (
              <div role="status" className="mb-6 p-3 rounded-xl border border-amber-500/40 bg-amber-950/20 text-amber-200 text-xs flex items-center gap-2">
                <Info className="h-4 w-4 text-amber-400 shrink-0" />
                {emulatedNotice}
              </div>
            )}

            {/* Workflow Execution Pipeline */}
            <FlowControls
              onIssue={run.issue}
              onVerify={run.verify}
              onRunFullFlow={run.runFullFlow}
              onReset={run.reset}
              phase={run.phase}
              transactionId={run.transactionId}
              issuedCredential={run.issuedCredential}
              credentialOffer={run.credentialOffer}
              presentationDefinition={run.presentationDefinition}
              verificationResult={run.verificationResult}
              format={selection.format}
              verifier={selection.verifier}
            />

            {/* Live Visualizations (Ayaan's Sequence + Inspector) */}
            <div className="grid grid-cols-1 gap-6">
              <SequenceDiagram logs={run.logs} />
              <ProtocolInspector logs={run.logs} onClearLogs={run.clearLogs} />
            </div>
          </div>
        ) : (
          <InteropMatrixReport
            history={run.history}
            onRunAll={handleRunAll}
            batchProgress={batchProgress}
            busy={run.busy}
            onClearHistory={run.clearHistory}
          />
        )}
      </main>

      <footer className="print:hidden border-t border-slate-900 bg-slate-950/80 py-4 px-6 text-center text-xs text-slate-500">
        MOSIP VC Interoperability Playground &bull; OpenID4VCI (Draft 13) &bull; OpenID4VP (Draft 21) &bull; W3C VC JSON-LD &bull; SD-JWT VC
      </footer>
    </div>
  );
};
