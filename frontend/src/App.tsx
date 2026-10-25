import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { MatrixSelector } from './components/MatrixSelector';
import { FlowControls } from './components/FlowControls';
import { ProtocolInspector } from './components/ProtocolInspector';
import { SequenceDiagram } from './components/SequenceDiagram';
import { InteropMatrixReport } from './components/InteropMatrixReport';
import { RunTimeline } from './components/RunTimeline';
import { RunPlayer } from './components/RunPlayer';
import { replaySlice } from './lib/participants';
import { usePlaygroundRun } from './hooks/usePlaygroundRun';
import { api } from './api/client';
import { allCombinations, DEFAULT_SUBJECT } from './config/nodes';
import { Scenario } from './config/scenarios';
import { RunInputs } from './types';
import { fallbackNotice } from './lib/fallback';
import { AlertTriangle, Info } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'playground' | 'matrix'>('playground');
  const [serverConnected, setServerConnected] = useState<boolean | null>(null);
  const run = usePlaygroundRun();
  const { selection } = run;
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const emulatedNotice = fallbackNotice(selection, run.issueFallback, run.verifyFallback);
  const [logScope, setLogScope] = useState<'run' | 'all'>('run');
  const [inputs, setInputs] = useState<RunInputs>({
    subject: DEFAULT_SUBJECT,
    tamperMode: false,
    tamperOptions: { forceExpired: false, corruptSignature: false, wrongCredentialType: false }
  });

  // A preset sets the matrix and tamper options the user can see, then runs.
  const runScenario = (scenario: Scenario) => {
    setInputs(prev => ({
      ...prev,
      tamperMode: Boolean(scenario.tamper),
      tamperOptions: scenario.tamper ?? { forceExpired: false, corruptSignature: false, wrongCredentialType: false }
    }));
    run.select(scenario.selection);
    void run.runFullFlow(inputs.subject, scenario.tamper ?? undefined, scenario.selection);
  };
  const txCount = new Set(run.logs.map(l => l.transactionId)).size;
  const visibleLogs = logScope === 'all' ? run.logs : run.logs.filter(l => l.transactionId && l.transactionId === run.transactionId);
  // Replay position over the visible logs; null follows the live run.
  const [revealed, setRevealed] = useState<number | null>(null);
  // Phones: raw messages are collapsed by default; the timeline gives the overview.
  const [rawOpen, setRawOpen] = useState(false);
  const shownLogs = replaySlice(visibleLogs, revealed);
  // New traffic or a different view snaps back to live.
  useEffect(() => setRevealed(null), [visibleLogs.length, logScope, run.transactionId]);

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
    <div className="min-h-screen bg-canvas text-ink flex flex-col">
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
              <div role="alert" className="mb-5 p-3 rounded-md border border-danger-line border-l-4 bg-danger-soft text-danger-ink text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {run.error}
              </div>
            )}
            {(emulatedNotice || run.notices.length > 0) && (
              <div
                role="note"
                className={`mb-5 p-3 rounded-md border border-l-4 text-sm flex items-start gap-2 ${
                  // Amber only when something was emulated; otherwise the BFF's notice is plain information.
                  emulatedNotice ? 'border-warning-line bg-warning-soft text-warning-ink' : 'border-line border-l-line-strong bg-surface text-ink-muted'
                }`}
              >
                <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1">
                  {emulatedNotice && <p>{emulatedNotice}</p>}
                  {/* The BFF says why: sandbox unreachable, or a step that needs a user login. */}
                  {run.notices.map(notice => (
                    <p key={notice} className="text-xs">{notice}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5 items-start">
              {/* Actions: workflow execution pipeline */}
              <FlowControls
                onIssue={run.issue}
                onVerify={run.verify}
                onRunFullFlow={run.runFullFlow}
                onReset={run.reset}
                phase={run.phase}
                transactionId={run.transactionId}
                issuedCredential={run.issuedCredential}
                credentialOffer={run.credentialOffer}
                credentialOfferUri={run.credentialOfferUri}
                presentationDefinition={run.presentationDefinition}
                presentationDefinitionUri={run.presentationDefinitionUri}
                presentationRequest={run.presentationRequest}
                onImport={run.importCredential}
                imported={run.imported}
                verificationResult={run.verificationResult}
                format={selection.format}
                verifier={selection.verifier}
                inputs={inputs}
                onInputsChange={setInputs}
                onRunScenario={runScenario}
              />

              {/* Effects: live protocol view, kept beside the actions on wide screens */}
              <aside aria-label="Live protocol view" className="space-y-4 xl:sticky xl:top-28 xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto xl:pr-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-ink">Live protocol view</h2>
                  {txCount > 1 && (
                    <div role="radiogroup" aria-label="Log scope" className="inline-flex rounded border border-line-strong overflow-hidden text-xs">
                      {(['run', 'all'] as const).map(scope => (
                        <button
                          key={scope}
                          type="button"
                          role="radio"
                          aria-checked={logScope === scope}
                          onClick={() => setLogScope(scope)}
                          className={`px-2.5 py-1 transition-colors not-first:border-l not-first:border-line-strong ${logScope === scope ? 'bg-accent text-white' : 'bg-surface text-ink hover:bg-surface-muted'}`}
                        >
                          {scope === 'run' ? 'This run' : `All runs (${txCount})`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {visibleLogs.length === 0 ? (
                  <div className="p-6 rounded-md border border-dashed border-line-strong bg-surface text-center text-sm text-ink-muted">
                    {run.logs.length === 0
                      ? 'No run yet. Press Run Full Flow, or issue a credential, to see every protocol message here.'
                      : 'No messages for the current run yet. Switch to All runs to see earlier traffic.'}
                  </div>
                ) : (
                  <>
                    <section aria-label="Run progress" className="bg-surface border border-line rounded-md p-4">
                      <RunPlayer logs={visibleLogs} revealed={revealed} onChange={setRevealed} />
                      <RunTimeline logs={visibleLogs} revealed={revealed ?? undefined} />
                    </section>
                    {/* The diagram is unreadable on phones; the timeline above covers it there. */}
                    <div className="hidden md:block">
                      <SequenceDiagram logs={shownLogs} />
                    </div>
                    <button
                      type="button"
                      aria-expanded={rawOpen}
                      onClick={() => setRawOpen(!rawOpen)}
                      className="md:hidden w-full py-2 rounded border border-line-strong bg-surface text-sm text-ink hover:bg-surface-muted transition-colors"
                    >
                      {rawOpen ? 'Hide raw protocol messages' : 'Show raw protocol messages'}
                    </button>
                    <div className={rawOpen ? '' : 'hidden md:block'}>
                      <ProtocolInspector logs={shownLogs} onClearLogs={run.clearLogs} />
                    </div>
                  </>
                )}
              </aside>
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

      <footer className="print:hidden border-t border-line bg-surface py-4 px-6 text-center text-xs text-ink-subtle">
        MOSIP VC Interoperability Playground &bull; OpenID4VCI (Draft 13) &bull; OpenID4VP (Draft 21) &bull; W3C VC JSON-LD &bull; SD-JWT VC
      </footer>
    </div>
  );
};
