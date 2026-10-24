import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { ProtocolLog } from '../types';
import { GitCommit, Sparkles, Maximize2, X } from 'lucide-react';
import { participantOf } from '../lib/participants';

interface SequenceDiagramProps {
  logs: ProtocolLog[];
}

export const SequenceDiagram: React.FC<SequenceDiagramProps> = ({ logs }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string>('');

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
        showSequenceNumbers: true,
        mirrorActors: false,
        wrap: true
      }
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    if (logs.length === 0) {
      setSvgContent('');
      containerRef.current.innerHTML = `
        <div class="h-28 flex flex-col items-center justify-center text-slate-500 text-xs gap-1.5 p-3">
          <div class="w-full max-w-xs space-y-1.5 opacity-50 animate-pulse">
            <div class="flex justify-between items-center px-4">
              <div class="h-4 w-14 bg-slate-800 rounded border border-slate-700/50 flex items-center justify-center text-[9px] text-slate-400">Issuer</div>
              <div class="h-4 w-14 bg-slate-800 rounded border border-slate-700/50 flex items-center justify-center text-[9px] text-slate-400">Wallet</div>
              <div class="h-4 w-14 bg-slate-800 rounded border border-slate-700/50 flex items-center justify-center text-[9px] text-slate-400">Verifier</div>
            </div>
            <div class="h-1 w-2/3 mx-auto bg-gradient-to-r from-sky-500/20 via-sky-400/40 to-transparent rounded"></div>
          </div>
          <span class="font-medium text-slate-400">No sequence events recorded yet.</span>
          <span class="text-[11px] text-slate-500">Run a flow to visualize the message exchange.</span>
        </div>
      `;
      return;
    }

    // Build Mermaid sequence text from chronological logs
    const sorted = [...logs].sort((a, b) => {
      if (a.step !== b.step) {
        return a.step - b.step;
      }
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

    let diagram = 'sequenceDiagram\n';
    diagram += '  autonumber\n';
    diagram += '  participant Issuer as Issuer (OpenID4VCI)\n';
    diagram += '  participant Wallet as Wallet (Holder)\n';
    diagram += '  participant Verifier as Verifier (OpenID4VP)\n\n';

    sorted.forEach((l) => {
      const from = participantOf(l.sender) ?? 'Wallet';
      const to = participantOf(l.receiver) ?? 'Issuer';

      const statusEmoji = l.status === 'SUCCESS' ? '✓' : '✗';
      const cleanAction = l.action.replace(/[^a-zA-Z0-9_\- ]/g, '');

      if (l.tampered) {
        diagram += '  rect rgb(76, 29, 41)\n';
      }

      diagram += `  ${from}->>${to}: ${cleanAction} [${statusEmoji} ${l.status}]\n`;

      if (l.tampered) {
        diagram += `  Note over ${to}: ⚠️ Tampered Payload Detected!\n`;
        diagram += '  end\n';
      }
    });

    const uniqueId = `mermaid-${Date.now()}`;
    setRenderError(null);

    mermaid
      .render(uniqueId, diagram)
      .then((res) => {
        setSvgContent(res.svg);
        if (containerRef.current) {
          containerRef.current.innerHTML = res.svg;
        }
      })
      .catch((err) => {
        console.error('Mermaid render error:', err);
        setRenderError('Failed to render sequence graph');
      });
  }, [logs]);

  const openFullscreen = () => {
    if (dialogRef.current) {
      if (typeof dialogRef.current.showModal === 'function') {
        dialogRef.current.showModal();
      } else {
        dialogRef.current.setAttribute('open', 'true');
      }
    }
  };

  const closeFullscreen = () => {
    if (dialogRef.current) {
      if (typeof dialogRef.current.close === 'function') {
        dialogRef.current.close();
      } else {
        dialogRef.current.removeAttribute('open');
      }
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl mb-6">
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <GitCommit className="h-4 w-4 text-indigo-400" />
          <h3 className="text-sm font-bold text-white">Live Dynamic Sequence Visualizer</h3>
        </div>
        <div className="flex items-center gap-3">
          {logs.length > 0 && (
            <button
              type="button"
              onClick={openFullscreen}
              className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-950/40 border border-sky-800/50 hover:bg-sky-900/50 transition cursor-pointer"
              title="Expand Sequence Diagram Fullscreen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>Fullscreen</span>
            </button>
          )}
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-sky-400" />
            Auto-generated from BFF wire logs
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="w-full overflow-x-auto min-h-[120px] flex items-center justify-center bg-slate-950/80 rounded-xl p-3 border border-slate-800/80"
      >
        {renderError && <div className="text-xs text-rose-400">{renderError}</div>}
      </div>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) {
            closeFullscreen();
          }
        }}
        className="bg-slate-900 border border-slate-700 text-white rounded-2xl p-6 backdrop:bg-black/80 max-w-5xl w-full max-h-[90vh] overflow-auto shadow-2xl m-auto"
      >
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <GitCommit className="h-5 w-5 text-indigo-400" />
            <h3 className="text-base font-bold text-white">Full-Screen Sequence Visualizer</h3>
          </div>
          <button
            type="button"
            onClick={closeFullscreen}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            title="Close Fullscreen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div
          className="w-full flex items-center justify-center overflow-x-auto bg-slate-950 rounded-xl p-6 border border-slate-800"
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </dialog>
    </div>
  );
};
