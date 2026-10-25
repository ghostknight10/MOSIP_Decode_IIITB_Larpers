import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, CircleDashed, Download, Play, Printer, Trash2, Loader2, FileJson } from 'lucide-react';
import { CredentialFormat, RunRecord } from '../types';
import { allCombinations, comboKey, formatLabel, nodeLabel } from '../config/nodes';
import { Selection } from '../hooks/usePlaygroundRun';
import { failureLayer, FailureLayer, LAYERS, shortLayer } from '../lib/failureLayer';
import { InteropHeatmap } from './report/InteropHeatmap';
import { btnPrimary, btnSecondary, btnSmall, chip } from './ui';

interface InteropMatrixReportProps {
  history: RunRecord[];
  onRunAll: () => void;
  batchProgress: { done: number; total: number } | null;
  busy: boolean;
  onClearHistory: () => void;
}

type Outcome = RunRecord['outcome'] | 'UNTESTED';

const OutcomeBadge: React.FC<{ outcome: Outcome }> = ({ outcome }) => {
  const style = {
    PASS: { cls: 'bg-success-soft text-success-ink border-success-line', Icon: CheckCircle2 },
    FAIL: { cls: 'bg-danger-soft text-danger-ink border-danger-line', Icon: XCircle },
    UNTESTED: { cls: 'bg-surface-muted text-ink-muted border-line', Icon: CircleDashed }
  }[outcome];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-xs border ${style.cls}`}>
      <style.Icon className="h-3 w-3" aria-hidden="true" />
      {outcome}
    </span>
  );
};

const FormatChip: React.FC<{ format: CredentialFormat }> = ({ format }) => (
  <span className={`${chip} whitespace-nowrap`}>
    {formatLabel(format)}
  </span>
);

const download = (filename: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const toMarkdown = (matrix: { combo: ReturnType<typeof allCombinations>[number]; run?: RunRecord }[], history: RunRecord[]) => {
  const row = (cells: (string | undefined)[]) => `| ${cells.map(c => (c ?? '').replace(/\|/g, '\\|')).join(' | ')} |`;
  const lines = [
    '# Interoperability Report',
    '',
    `Generated ${new Date().toISOString()} by the MOSIP VC Interoperability Playground.`,
    '',
    '## Matrix (latest clean run per combination)',
    '',
    row(['Issuer', 'Wallet', 'Verifier', 'Format', 'Proof type', 'Outcome', 'Layer', 'Error detail', 'Emulated sandbox']),
    row(['---', '---', '---', '---', '---', '---', '---', '---', '---']),
    ...matrix.map(({ combo, run }) =>
      row([
        nodeLabel(combo.issuer), nodeLabel(combo.wallet), nodeLabel(combo.verifier), formatLabel(combo.format),
        run?.proofType, run?.outcome ?? 'UNTESTED', run ? failureLayer(run) ?? '' : '', run?.errorDetail, run ? (run.sandboxFallback ? 'yes' : 'no') : ''
      ])
    ),
    '',
    '## All runs',
    '',
    row(['Time', 'Issuer', 'Wallet', 'Verifier', 'Format', 'Proof type', 'Mode', 'Verifier status', 'Outcome', 'Layer', 'Error detail', 'Transaction', 'Component builds']),
    row(['---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---']),
    ...history.map(r =>
      row([
        r.finishedAt, `${nodeLabel(r.issuer)}${r.imported ? ' (imported credential)' : ''}`, nodeLabel(r.wallet), nodeLabel(r.verifier), formatLabel(r.format), r.proofType,
        r.tampered ? 'tampered' : 'clean', r.verificationStatus, r.outcome, failureLayer(r) ?? '', r.errorDetail, r.transactionId, r.components
      ])
    ),
    '',
    '## Failure layers',
    '',
    ...LAYERS.map(l => `- **${l.layer}**: ${l.description}`)
  ];
  return lines.join('\n') + '\n';
};

interface Score {
  tested: number;
  passed: number;
}

const rate = ({ tested, passed }: Score) => (tested ? Math.round((passed / tested) * 100) : null);

/**
 * Splits matrix results into real and emulated-sandbox runs, so a pass rate
 * earned against the mock engine is never presented as an Inji result.
 */
export const scoreMatrix = (matrix: { run?: RunRecord }[]) => {
  const runs = matrix.flatMap(m => (m.run ? [m.run] : []));
  const score = (rs: RunRecord[]): Score => ({ tested: rs.length, passed: rs.filter(r => r.outcome === 'PASS').length });
  return {
    all: score(runs),
    real: score(runs.filter(r => !r.sandboxFallback)),
    emulated: score(runs.filter(r => r.sandboxFallback))
  };
};

const ScoreChip: React.FC<{ label: string; score: Score }> = ({ label, score }) => {
  const allPass = score.passed === score.tested;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
      allPass ? 'bg-success-soft text-success-ink border-success-line' : 'bg-danger-soft text-danger-ink border-danger-line'
    }`}>
      {allPass ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <XCircle className="h-3 w-3" aria-hidden="true" />}
      {label}: {score.passed}/{score.tested} pass
    </span>
  );
};

export const InteropMatrixReport: React.FC<InteropMatrixReportProps> = ({ history, onRunAll, batchProgress, busy, onClearHistory }) => {
  const [formatFilter, setFormatFilter] = useState<'all' | CredentialFormat>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | RunRecord['outcome']>('all');
  const [modeFilter, setModeFilter] = useState<'all' | 'clean' | 'tampered'>('all');
  const [layerFilter, setLayerFilter] = useState<'all' | FailureLayer>('all');
  const [buildFilter, setBuildFilter] = useState<string>('all');
  const builds = [...new Set(history.map(r => r.components).filter((b): b is string => Boolean(b)))];
  const [view, setView] = useState<'heatmap' | 'list'>('heatmap');
  const [comboFilter, setComboFilter] = useState<Selection | null>(null);

  // History is newest-first, so the first clean run seen per combination is the latest.
  const { latest, matrix } = useMemo(() => {
    const latest = new Map<string, RunRecord>();
    for (const r of history) {
      if (!r.tampered && !latest.has(comboKey(r))) latest.set(comboKey(r), r);
    }
    return { latest, matrix: allCombinations().map(combo => ({ combo, run: latest.get(comboKey(combo)) })) };
  }, [history]);

  const scores = scoreMatrix(matrix);
  const allEmulated = scores.all.tested > 0 && scores.real.tested === 0;
  const negativeRuns = history.filter(r => r.tampered);
  const negativePassed = negativeRuns.filter(r => r.outcome === 'PASS').length;

  const filtered = history.filter(r =>
    (formatFilter === 'all' || r.format === formatFilter) &&
    (outcomeFilter === 'all' || r.outcome === outcomeFilter) &&
    (modeFilter === 'all' || (modeFilter === 'tampered') === r.tampered) &&
    (layerFilter === 'all' || failureLayer(r) === layerFilter) &&
    (buildFilter === 'all' || r.components === buildFilter) &&
    (!comboFilter || comboKey(r) === comboKey(comboFilter))
  );

  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const selectCls = 'bg-surface border border-line-strong rounded px-2 py-1 text-xs text-ink';
  const actionCls = btnSecondary;

  return (
    <section aria-labelledby="report-heading" className="bg-surface border border-line rounded-md p-4 sm:p-5 mb-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-5 border-b border-line">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="report-heading" className="text-base font-semibold text-ink">Interoperability report</h2>
            {scores.real.tested > 0 && <ScoreChip label="Real" score={scores.real} />}
            {scores.emulated.tested > 0 && <ScoreChip label="Emulated" score={scores.emulated} />}
            {allEmulated && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-warning-soft text-warning-ink border-warning-line inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" /> No real MOSIP results yet
              </span>
            )}
          </div>
          <p className="text-xs text-ink-muted mt-1">
            Results from actual playground runs between MOSIP reference implementations and independent OpenID4VCI / OpenID4VP engines.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 print:hidden">
          <button onClick={onRunAll} disabled={busy || !!batchProgress} className={btnPrimary}>
            {batchProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {batchProgress ? `Running ${batchProgress.done}/${batchProgress.total}…` : 'Run All Combinations'}
          </button>
          <button onClick={() => download(`interop-report-${stamp}.md`, toMarkdown(matrix, history), 'text/markdown')} disabled={!history.length} className={actionCls}>
            <Download className="h-4 w-4" aria-hidden="true" /> Markdown
          </button>
          <button onClick={() => download(`interop-runs-${stamp}.json`, JSON.stringify(history, null, 2), 'application/json')} disabled={!history.length} className={actionCls}>
            <FileJson className="h-4 w-4" aria-hidden="true" /> JSON
          </button>
          <button onClick={() => window.print()} className={actionCls}>
            <Printer className="h-4 w-4" aria-hidden="true" /> Print
          </button>
          <button
            onClick={() => window.confirm('Clear all recorded runs from this browser?') && onClearHistory()}
            disabled={!history.length || !!batchProgress}
            className={actionCls}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Clear
          </button>
        </div>
      </div>

      {/* Summary Scorecard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-md bg-surface border border-line">
          <div className="text-xs text-ink-muted font-medium">Combinations tested</div>
          <div className="text-2xl font-semibold text-ink mt-1">{scores.all.tested} / {matrix.length}</div>
        </div>
        <div className="p-4 rounded-md bg-surface border border-line">
          <div className="text-xs text-ink-muted font-medium">Standards profile</div>
          <div className="text-sm font-mono text-ink mt-1.5">OpenID4VCI Draft 13<br />OpenID4VP Draft 21</div>
        </div>
        <div className="p-4 rounded-md bg-surface border border-line">
          <div className="text-xs text-ink-muted font-medium">Negative-path runs</div>
          <div className="text-2xl font-semibold text-ink mt-1">
            {negativePassed} / {negativeRuns.length}
            <span className="text-xs font-normal text-ink-muted ml-2">correctly rejected</span>
          </div>
        </div>
        <div className="p-4 rounded-md bg-surface border border-line">
          <div className="text-xs text-ink-muted">Pass rate</div>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 items-baseline">
            <dt className="text-xs text-ink-muted">Real</dt>
            <dd className="text-2xl font-semibold text-ink">
              {rate(scores.real) === null ? '—' : `${rate(scores.real)}%`}
            </dd>
            <dt className="text-xs text-ink-muted">Emulated</dt>
            <dd className="text-sm font-semibold text-ink-muted">{rate(scores.emulated) === null ? '—' : `${rate(scores.emulated)}%`}</dd>
          </dl>
        </div>
      </div>

      {/* Matrix */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-ink">Matrix <span className="text-xs font-normal text-ink-muted">— latest clean run per combination</span></h3>
        <div role="radiogroup" aria-label="Matrix view" className="inline-flex rounded border border-line-strong overflow-hidden text-xs print:hidden">
          {(['heatmap', 'list'] as const).map(v => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={`px-2.5 py-1 transition-colors not-first:border-l not-first:border-line-strong ${view === v ? 'bg-accent text-ink' : 'bg-surface text-ink hover:bg-surface-muted'}`}
            >
              {v === 'heatmap' ? 'Heatmap' : 'List'}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-ink-muted mb-2">
        <span aria-hidden="true" className="text-warning-ink font-semibold">†</span> answered by the emulated sandbox, not a real MOSIP service.
        {view === 'heatmap' && ' Select a cell to filter the run history.'}
      </p>
      {view === 'heatmap' && (
        <div className="mb-3">
          <InteropHeatmap latest={latest} selectedKey={comboFilter ? comboKey(comboFilter) : null} onSelect={setComboFilter} />
        </div>
      )}
      <details className="mb-8 text-xs text-ink-muted">
        <summary className="cursor-pointer text-ink-muted">Failure layers (Schumm et al., 2025)</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {LAYERS.map(l => (
            <React.Fragment key={l.layer}>
              <dt className="font-mono text-ink">{l.short}</dt>
              <dd>
                <span className="text-ink">{l.layer}:</span> {l.description}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      </details>
      {view === 'list' && (
      <div className="overflow-x-auto rounded-md border border-line mb-8">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-muted text-ink-muted font-medium border-b border-line">
            <tr>
              <th className="p-3">Issuer</th>
              <th className="p-3">Wallet</th>
              <th className="p-3">Verifier</th>
              <th className="p-3">Format</th>
              <th className="p-3">Proof type</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3">Layer</th>
              <th className="p-3">Error detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line text-ink-muted">
            {matrix.map(({ combo, run }) => (
              <tr key={comboKey(combo)} className="hover:bg-surface-muted transition-colors">
                <td className="p-3 font-medium text-ink">{nodeLabel(combo.issuer)}</td>
                <td className="p-3">{nodeLabel(combo.wallet)}</td>
                <td className="p-3">{nodeLabel(combo.verifier)}</td>
                <td className="p-3"><FormatChip format={combo.format} /></td>
                <td className="p-3 font-mono">{run?.proofType ?? '—'}</td>
                <td className="p-3 text-center">
                  <OutcomeBadge outcome={run?.outcome ?? 'UNTESTED'} />
                  {run?.sandboxFallback && (
                    <abbr title="Emulated sandbox response" aria-label="emulated" className="ml-1 text-warning-ink font-semibold no-underline">†</abbr>
                  )}
                </td>
                <td className="p-3 font-mono">{run && failureLayer(run) ? shortLayer(failureLayer(run)!) : ''}</td>
                <td className="p-3 text-danger-ink max-w-xs">{run?.errorDetail ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* Run history */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold text-ink">Run history <span className="text-xs font-normal text-ink-muted">({filtered.length} of {history.length})</span></h3>
        <div className="flex flex-wrap gap-2 print:hidden">
          <select aria-label="Filter by format" value={formatFilter} onChange={e => setFormatFilter(e.target.value as typeof formatFilter)} className={selectCls}>
            <option value="all">All formats</option>
            <option value="w3c-vc">W3C VC</option>
            <option value="sd-jwt">SD-JWT VC</option>
          </select>
          <select aria-label="Filter by outcome" value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value as typeof outcomeFilter)} className={selectCls}>
            <option value="all">All outcomes</option>
            <option value="PASS">Pass</option>
            <option value="FAIL">Fail</option>
          </select>
          <select aria-label="Filter by mode" value={modeFilter} onChange={e => setModeFilter(e.target.value as typeof modeFilter)} className={selectCls}>
            <option value="all">Clean + tampered</option>
            <option value="clean">Clean only</option>
            <option value="tampered">Tampered only</option>
          </select>
          <select aria-label="Filter by layer" value={layerFilter} onChange={e => setLayerFilter(e.target.value as typeof layerFilter)} className={selectCls}>
            <option value="all">All layers</option>
            {LAYERS.filter(l => l.layer !== 'Legal').map(l => (
              <option key={l.layer} value={l.layer}>
                {l.layer}
              </option>
            ))}
            <option value="Unclassified">Unclassified</option>
          </select>
          {builds.length > 0 && (
            <select aria-label="Filter by component build" value={buildFilter} onChange={e => setBuildFilter(e.target.value)} className={selectCls}>
              <option value="all">All component builds</option>
              {builds.map(b => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {comboFilter && (
        <p className="mb-2 text-xs text-ink-muted flex flex-wrap items-center gap-2">
          Showing {nodeLabel(comboFilter.issuer)} → {nodeLabel(comboFilter.wallet)} → {nodeLabel(comboFilter.verifier)} · {formatLabel(comboFilter.format)}
          <button type="button" onClick={() => setComboFilter(null)} className={btnSmall}>
            Clear combination filter
          </button>
        </p>
      )}
      {history.length === 0 ? (
        <div className="flex flex-col items-center gap-4 p-10 border border-dashed border-line-strong rounded-md text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 64 64"
            className="w-14 h-14 text-ink-subtle opacity-60"
            fill="none"
            aria-hidden="true"
          >
            <rect x="6" y="14" width="16" height="36" rx="3" stroke="currentColor" strokeWidth="2.5" />
            <rect x="24" y="22" width="16" height="28" rx="3" stroke="currentColor" strokeWidth="2.5" />
            <rect x="42" y="30" width="16" height="20" rx="3" stroke="currentColor" strokeWidth="2.5" />
            <path d="M8 42 L22 30 L28 36 L40 22 L58 14" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2" strokeLinecap="round" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-ink mb-1">No runs yet</p>
            <p className="text-xs text-ink-muted max-w-xs">
              Run a flow in the Playground or use <strong>Run All Combinations</strong> above to test all {allCombinations().length} issuer × wallet × verifier × format combinations.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-muted text-ink-muted font-medium border-b border-line">
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">Issuer → Wallet → Verifier</th>
                <th className="p-3">Format</th>
                <th className="p-3">Proof</th>
                <th className="p-3">Mode</th>
                <th className="p-3">Verifier status</th>
                <th className="p-3 text-center">Outcome</th>
                <th className="p-3">Layer</th>
                <th className="p-3">Error detail</th>
                <th className="p-3">Transaction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-ink-muted">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-surface-muted transition-colors">
                  <td className="p-3 font-mono whitespace-nowrap">{new Date(r.finishedAt).toLocaleString()}</td>
                  <td className="p-3 min-w-64">
                    {nodeLabel(r.issuer)}
                    {r.imported && <span className="text-ink-subtle"> (imported credential)</span>} → {nodeLabel(r.wallet)} → {nodeLabel(r.verifier)}
                  </td>
                  <td className="p-3"><FormatChip format={r.format} /></td>
                  <td className="p-3 font-mono">{r.proofType}</td>
                  <td className="p-3">{r.tampered ? <span className="text-warning-ink">tampered</span> : 'clean'}</td>
                  <td className="p-3 font-mono">{r.verificationStatus ?? '—'}</td>
                  <td className="p-3 text-center"><OutcomeBadge outcome={r.outcome} /></td>
                  <td className="p-3 font-mono">{failureLayer(r) ?? ''}</td>
                  <td className="p-3 text-danger-ink max-w-xs">{r.errorDetail ?? ''}</td>
                  <td className="p-3 font-mono text-ink-subtle whitespace-nowrap">{r.transactionId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
