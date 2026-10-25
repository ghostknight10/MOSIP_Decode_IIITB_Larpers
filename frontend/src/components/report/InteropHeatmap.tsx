import React from 'react';
import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { RunRecord } from '../../types';
import { comboKey, FORMATS, ISSUERS, nodeLabel, VERIFIERS, WALLETS } from '../../config/nodes';
import { Selection } from '../../hooks/usePlaygroundRun';
import { failureLayer, shortLayer } from '../../lib/failureLayer';

interface InteropHeatmapProps {
  /** Latest clean run per combination key. */
  latest: Map<string, RunRecord>;
  selectedKey: string | null;
  onSelect: (combo: Selection | null) => void;
}

const CELL = {
  PASS: { Icon: CheckCircle2, cls: 'bg-success-soft border-success-line text-success-ink', label: 'PASS' },
  FAIL: { Icon: XCircle, cls: 'bg-danger-soft border-danger-line text-danger-ink', label: 'FAIL' },
  UNTESTED: { Icon: CircleDashed, cls: 'bg-surface-muted border-line text-ink-muted', label: 'UNTESTED' }
};

/**
 * Compatibility heatmap (wpt.fyi Interop style): issuer × wallet rows,
 * verifier × format columns. Status is icon + text, never colour alone.
 */
export const InteropHeatmap: React.FC<InteropHeatmapProps> = ({ latest, selectedKey, onSelect }) => {
  const rows = ISSUERS.flatMap(i => WALLETS.map(w => ({ issuer: i.id, wallet: w.id })));
  const cols = VERIFIERS.flatMap(v => FORMATS.map(f => ({ verifier: v.id, format: f.id })));

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full text-xs border-separate border-spacing-1">
        <caption className="sr-only">Latest clean run per issuer, wallet, verifier and format combination</caption>
        <thead>
          <tr>
            <td rowSpan={2} />
            {VERIFIERS.map(v => (
              <th key={v.id} scope="colgroup" colSpan={FORMATS.length} className="p-1.5 text-ink font-semibold">
                {v.label}
              </th>
            ))}
          </tr>
          <tr>
            {cols.map(c => (
              <th key={`${c.verifier}|${c.format}`} scope="col" className="p-1 text-ink-muted font-normal">
                {FORMATS.find(f => f.id === c.format)?.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={`${r.issuer}|${r.wallet}`}>
              <th scope="row" className="p-1.5 text-left font-medium text-ink whitespace-nowrap">
                {nodeLabel(r.issuer)} <span className="text-ink-subtle">→</span> {nodeLabel(r.wallet)}
              </th>
              {cols.map(c => {
                const combo: Selection = { ...r, ...c };
                const key = comboKey(combo);
                const run = latest.get(key);
                const state = CELL[run?.outcome ?? 'UNTESTED'];
                const layer = run ? failureLayer(run) : null;
                const selected = selectedKey === key;
                const description = [
                  `${nodeLabel(r.issuer)} → ${nodeLabel(r.wallet)} → ${nodeLabel(c.verifier)}, ${FORMATS.find(f => f.id === c.format)?.label}`,
                  state.label,
                  run?.sandboxFallback ? 'emulated sandbox' : '',
                  layer ? `${layer} layer` : ''
                ]
                  .filter(Boolean)
                  .join(', ');
                return (
                  <td key={key} className="p-0">
                    <button
                      type="button"
                      aria-label={description}
                      aria-pressed={selected}
                      title={run?.errorDetail ?? description}
                      onClick={() => onSelect(selected ? null : combo)}
                      className={`w-full min-w-20 p-2 rounded border transition-colors flex flex-col items-center gap-0.5 ${state.cls} ${
                        selected ? 'outline-2 outline-accent outline-offset-1' : 'hover:border-line-strong'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1 font-medium">
                        <state.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {run ? state.label : '—'}
                        {run?.sandboxFallback && <span className="text-warning-ink" aria-hidden="true">†</span>}
                      </span>
                      {layer && <span className="font-mono text-xs">{shortLayer(layer)}</span>}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
