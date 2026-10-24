import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { MatrixSelector } from './components/MatrixSelector';
import { FlowControls } from './components/FlowControls';
import { ProtocolInspector } from './components/ProtocolInspector';
import { SequenceDiagram } from './components/SequenceDiagram';
import { InteropMatrixReport } from './components/InteropMatrixReport';
import { usePlaygroundRun } from './hooks/usePlaygroundRun';
import { api } from './api/client';
import { AlertTriangle, Info } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'playground' | 'matrix'>('playground');
  const [serverConnected, setServerConnected] = useState<boolean>(false);
  const run = usePlaygroundRun();
  const { selection } = run;

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
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {activeTab === 'playground' ? (
          <div>
            {/* 3-Column Matrix Configurator */}
            <MatrixSelector
              issuer={selection.issuer}
              setIssuer={issuer => run.select({ issuer })}
              wallet={selection.wallet}
              setWallet={wallet => run.select({ wallet })}
              verifier={selection.verifier}
              setVerifier={verifier => run.select({ verifier })}
              format={selection.format}
              setFormat={format => run.select({ format })}
              flowState={run.phase}
            />

            {run.error && (
              <div role="alert" className="mb-6 p-3 rounded-xl border border-rose-500/40 bg-rose-950/30 text-rose-200 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                {run.error}
              </div>
            )}
            {run.sandboxFallback && run.notices.length > 0 && (
              <div className="mb-6 p-3 rounded-xl border border-amber-500/40 bg-amber-950/20 text-amber-200 text-xs flex items-center gap-2">
                <Info className="h-4 w-4 text-amber-400 flex-shrink-0" />
                Sandbox unreachable — showing emulated responses. {run.notices.join(' ')}
              </div>
            )}

            {/* Workflow Execution Pipeline */}
            <FlowControls
              onIssue={run.issue}
              onVerify={run.verify}
              loading={run.busy}
              issuedCredential={run.issuedCredential}
              credentialOffer={run.credentialOffer}
              verificationResult={run.verificationResult}
              format={selection.format}
            />

            {/* Live Visualizations (Ayaan's Sequence + Inspector) */}
            <div className="grid grid-cols-1 gap-6">
              <SequenceDiagram logs={run.logs} />
              <ProtocolInspector logs={run.logs} onClearLogs={run.clearLogs} />
            </div>
          </div>
        ) : (
          <InteropMatrixReport />
        )}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 px-6 text-center text-xs text-slate-500">
        MOSIP VC Interoperability Playground &bull; OpenID4VCI (Draft 13) &bull; OpenID4VP (Draft 21) &bull; W3C VC JSON-LD &bull; SD-JWT VC
      </footer>
    </div>
  );
};
