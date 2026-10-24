import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { ProtocolLog } from '../types';
import { GitCommit, Sparkles } from 'lucide-react';

interface SequenceDiagramProps {
  logs: ProtocolLog[];
}

export const SequenceDiagram: React.FC<SequenceDiagramProps> = ({ logs }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        darkMode: true,
        background: '#090d16',
        primaryColor: '#0284c7',
        primaryTextColor: '#f8fafc',
        primaryBorderColor: '#38bdf8',
        lineColor: '#64748b',
        secondaryColor: '#6366f1',
        tertiaryColor: '#10b981',
        noteBkgColor: '#1e293b',
        noteTextColor: '#f1f5f9',
        actorBkg: '#0f172a',
        actorBorder: '#38bdf8',
        actorTextColor: '#f8fafc',
        signalColor: '#38bdf8',
        signalTextColor: '#f8fafc'
      },
      sequence: {
        actorMargin: 50,
        showSequenceNumbers: true
      }
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    if (logs.length === 0) {
      containerRef.current.innerHTML = `
        <div class="h-44 flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
          <span>No sequence events recorded yet.</span>
          <span>Execute an Issuance or Verification step above to visualize the flow dynamically.</span>
        </div>
      `;
      return;
    }

    // Build Mermaid sequence text from chronological logs
    const sorted = [...logs].reverse(); // reverse so chronological
    let diagram = 'sequenceDiagram\n';
    diagram += '  autonumber\n';
    diagram += '  actor User as User\n';
    diagram += '  participant Issuer as Issuer (OpenID4VCI)\n';
    diagram += '  participant Wallet as Wallet (Holder)\n';
    diagram += '  participant Verifier as Verifier (OpenID4VP)\n\n';

    sorted.forEach((l) => {
      let from = 'Wallet';
      let to = 'Issuer';

      const s = l.sender.toLowerCase();
      const r = l.receiver.toLowerCase();

      if (s.includes('verifier')) from = 'Verifier';
      else if (s.includes('issuer')) from = 'Issuer';
      else if (s.includes('wallet')) from = 'Wallet';

      if (r.includes('verifier')) to = 'Verifier';
      else if (r.includes('issuer')) to = 'Issuer';
      else if (r.includes('wallet')) to = 'Wallet';

      const statusEmoji = l.status === 'SUCCESS' ? '✓' : '✗';
      const cleanAction = l.action.replace(/[^a-zA-Z0-9_\- ]/g, '');
      diagram += `  ${from}->>${to}: ${cleanAction} [${statusEmoji} ${l.status}]\n`;
      if (l.tampered) {
        diagram += `  Note over ${to}: ⚠️ Tampered Payload Detected!\n`;
      }
    });

    const uniqueId = `mermaid-${Date.now()}`;
    setRenderError(null);

    mermaid
      .render(uniqueId, diagram)
      .then((res) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = res.svg;
        }
      })
      .catch((err) => {
        console.error('Mermaid render error:', err);
        setRenderError('Failed to render sequence graph');
      });
  }, [logs]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl mb-6">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <GitCommit className="h-4 w-4 text-indigo-400" />
          <h3 className="text-sm font-bold text-white">Live Dynamic Sequence Visualizer</h3>
        </div>
        <span className="text-[11px] text-slate-400 flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-sky-400" />
          Auto-generated from BFF wire logs
        </span>
      </div>

      <div
        ref={containerRef}
        className="w-full overflow-x-auto min-h-[160px] flex items-center justify-center bg-slate-950/80 rounded-xl p-4 border border-slate-800/80"
      >
        {renderError && <div className="text-xs text-rose-400">{renderError}</div>}
      </div>
    </div>
  );
};
