import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { MatrixSelector } from './components/MatrixSelector';
import { FlowControls } from './components/FlowControls';
import { ProtocolInspector } from './components/ProtocolInspector';
import { SequenceDiagram } from './components/SequenceDiagram';
import { InteropMatrixReport } from './components/InteropMatrixReport';
import { IssuerType, WalletType, VerifierType, CredentialFormat, ProtocolLog, VerificationResult } from './types';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'playground' | 'matrix'>('playground');
  const [serverConnected, setServerConnected] = useState<boolean>(false);

  // Matrix selection states
  const [issuer, setIssuer] = useState<IssuerType>('inji-certify');
  const [wallet, setWallet] = useState<WalletType>('inji-wallet');
  const [verifier, setVerifier] = useState<VerifierType>('inji-verify');
  const [format, setFormat] = useState<CredentialFormat>('w3c-vc');
  const [flowState, setFlowState] = useState<'idle' | 'issuing' | 'issued' | 'verifying' | 'verified'>('idle');

  // Transaction payloads & logs
  const [loading, setLoading] = useState<boolean>(false);
  const [credentialOffer, setCredentialOffer] = useState<any>(null);
  const [issuedCredential, setIssuedCredential] = useState<any>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [logs, setLogs] = useState<ProtocolLog[]>([]);

  // Check BFF health on load
  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(() => setServerConnected(true))
      .catch(() => setServerConnected(false));
  }, []);

  const handleIssue = async (subjectData: any, tamperPayload?: any) => {
    setLoading(true);
    setFlowState('issuing');
    try {
      const res = await fetch('/api/playground/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issuer,
          wallet,
          format,
          credentialSubject: subjectData,
          tamperPayload
        })
      });
      const data = await res.json();
      if (data.success) {
        setCredentialOffer(data.credentialOffer);
        setIssuedCredential(data.issuedCredential);
        setFlowState('issued');
        if (data.protocolLogs) {
          setLogs(prev => [...data.protocolLogs, ...prev]);
        }
      }
    } catch (err) {
      console.error('Issuance flow error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (tamperPayload?: any) => {
    setLoading(true);
    setFlowState('verifying');
    try {
      const res = await fetch('/api/playground/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verifier,
          wallet,
          format,
          credentialOrToken: issuedCredential,
          tamperPayload
        })
      });
      const data = await res.json();
      if (data.success) {
        setVerificationResult(data.verificationResult);
        setFlowState('verified');
        if (data.protocolLogs) {
          setLogs(prev => [...data.protocolLogs, ...prev]);
        }
      }
    } catch (err) {
      console.error('Verification flow error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      await fetch('/api/playground/logs', { method: 'DELETE' });
      setLogs([]);
    } catch (err) {
      console.error('Clear logs error:', err);
    }
  };

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
              issuer={issuer}
              setIssuer={setIssuer}
              wallet={wallet}
              setWallet={setWallet}
              verifier={verifier}
              setVerifier={setVerifier}
              format={format}
              setFormat={setFormat}
              flowState={flowState}
            />

            {/* Workflow Execution Pipeline */}
            <FlowControls
              onIssue={handleIssue}
              onVerify={handleVerify}
              loading={loading}
              issuedCredential={issuedCredential}
              credentialOffer={credentialOffer}
              verificationResult={verificationResult}
              format={format}
            />

            {/* Live Visualizations (Ayaan's Sequence + Inspector) */}
            <div className="grid grid-cols-1 gap-6">
              <SequenceDiagram logs={logs} />
              <ProtocolInspector logs={logs} onClearLogs={handleClearLogs} />
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
