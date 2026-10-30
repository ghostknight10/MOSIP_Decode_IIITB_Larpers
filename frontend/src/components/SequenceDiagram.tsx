import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { ProtocolLog } from '../types';
import { Maximize2, X } from 'lucide-react';
import { chronological, participantOf } from '../lib/participants';
import { Theme } from '../hooks/useTheme';

interface SequenceDiagramProps {
  logs: ProtocolLog[];
  /** The page theme: the diagram is drawn again, in its colours, when it changes. */
  theme?: Theme;
}

/** #rrggbb as "r, g, b" for Mermaid's rect fill. */
const rgbOf = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ');

export const SequenceDiagram: React.FC<SequenceDiagramProps> = ({ logs, theme = 'light' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string>('');

  // Mermaid needs literal colours, so read the active theme's tokens from the page.
  // (The fallbacks are the light theme, for where the stylesheet is not loaded.)
  useEffect(() => {
    const token = (name: string, fallback: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim() || fallback;
    const surface = token('surface', '#ffffff');
    const border = token('line-strong', '#c4c9d2');
    const ink = token('ink', '#1b1e24');
    const line = token('ink-muted', '#454b57');
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: {
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        background: surface,
        primaryColor: token('surface-muted', '#f4f5f7'),
        primaryTextColor: ink,
        primaryBorderColor: border,
        lineColor: line,
        secondaryColor: token('accent-soft', '#f8eef4'),
        tertiaryColor: token('canvas', '#fafbfd'),
        noteBkgColor: token('warning-soft', '#fff5e3'),
        noteBorderColor: token('warning-line', '#d98c00'),
        noteTextColor: token('warning-ink', '#7a4f00'),
        actorBkg: surface,
        actorBorder: border,
        actorTextColor: ink,
        actorLineColor: border,
        signalColor: line,
        signalTextColor: ink,
        sequenceNumberColor: surface
      },
      sequence: {
        actorMargin: 50,
        showSequenceNumbers: true,
        mirrorActors: false,
        wrap: true
      }
    });
  }, [theme]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (logs.length === 0) {
      setSvgContent('');
      containerRef.current.innerHTML = `
        <div class="py-6 flex flex-col items-center justify-center text-center text-sm text-ink-muted gap-1">
          <span>No sequence events recorded yet.</span>
          <span class="text-xs text-ink-subtle">Run a flow to see the message exchange.</span>
        </div>
      `;
      return;
    }

    // Arrival order (logs are stored newest-first), with each run kept together
    // so "All runs" doesn't interleave steps from different transactions.
    const runs = new Map<string, ProtocolLog[]>();
    for (const l of chronological(logs)) {
      const key = l.transactionId ?? '';
      runs.set(key, [...(runs.get(key) ?? []), l]);
    }
    const sorted = [...runs.values()].flat();

    let diagram = 'sequenceDiagram\n';
    diagram += '  autonumber\n';
    diagram += '  participant Issuer as Issuer (OpenID4VCI)\n';
    diagram += '  participant Wallet as Wallet (Holder)\n';
    diagram += '  participant Verifier as Verifier (OpenID4VP)\n\n';

    sorted.forEach((l, idx) => {
      const from = participantOf(l.sender) ?? 'Wallet';
      const to = participantOf(l.receiver) ?? 'Issuer';

      const statusEmoji = l.status === 'SUCCESS' ? '✓' : '✗';
      const cleanAction = l.action.replace(/[^a-zA-Z0-9_\- ]/g, '');

      // Mark where each run enters a protocol phase.
      const prev = sorted[idx - 1];
      if (!prev || prev.transactionId !== l.transactionId || prev.protocol !== l.protocol) {
        diagram += `  Note over Issuer,Verifier: ${l.protocol}${runs.size > 1 && l.transactionId ? ` · ${l.transactionId.replace(/[^a-zA-Z0-9_-]/g, '')}` : ''}\n`;
      }

      if (l.tampered) {
        // warning-soft of the active theme
        const warningSoft = getComputedStyle(document.documentElement).getPropertyValue('--color-warning-soft').trim();
        diagram += `  rect rgb(${/^#[0-9a-f]{6}$/i.test(warningSoft) ? rgbOf(warningSoft) : '255, 245, 227'})\n`;
      }

      diagram += `  ${from}->>${to}: ${cleanAction} [${statusEmoji} ${l.status}]\n`;

      if (l.tampered) {
        diagram += `  Note over ${to}: Tampered payload\n`;
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
  }, [logs, theme]);

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
    <div className="bg-surface border border-line rounded-md p-4 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-3 border-b border-line">
        <div>
          <h3 className="text-sm font-semibold text-ink">Live Dynamic Sequence Visualizer</h3>
          <p className="text-xs text-ink-subtle">Generated from the BFF wire logs</p>
        </div>
        <div className="flex items-center gap-3">
          {logs.length > 0 && (
            <button
              type="button"
              onClick={openFullscreen}
              className="text-xs text-ink flex items-center gap-1.5 px-2.5 py-1 rounded border border-line-strong bg-surface hover:bg-surface-muted transition-colors"
              title="Expand Sequence Diagram Fullscreen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span>Fullscreen</span>
            </button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="w-full overflow-x-auto min-h-[120px] flex items-center justify-center bg-surface rounded-md p-3 border border-line"
      >
        {renderError && <div className="text-xs text-danger-ink">{renderError}</div>}
      </div>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) {
            closeFullscreen();
          }
        }}
        className="bg-surface border border-line text-ink rounded-md p-5 backdrop:bg-scrim/50 max-w-5xl w-full max-h-[90vh] overflow-auto shadow-sm m-auto"
      >
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-line">
          <h3 className="text-base font-semibold text-ink">Full-Screen Sequence Visualizer</h3>
          <button
            type="button"
            onClick={closeFullscreen}
            className="text-ink-muted hover:text-ink p-1 rounded hover:bg-surface-muted transition-colors"
            title="Close Fullscreen"
            aria-label="Close fullscreen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div
          className="w-full flex items-center justify-center overflow-x-auto bg-surface rounded-md p-4 border border-line"
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </dialog>
    </div>
  );
};
