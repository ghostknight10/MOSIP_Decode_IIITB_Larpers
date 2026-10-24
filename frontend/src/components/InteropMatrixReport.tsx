import React, { useMemo, useState } from 'react';
import { CheckCircle2, XCircle, CircleDashed, Download, Award, Play, Printer, Trash2, Loader2, FileJson } from 'lucide-react';
import { CredentialFormat, RunRecord } from '../types';
import { allCombinations, comboKey, formatLabel, nodeLabel } from '../config/nodes';

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
    PASS: { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', Icon: CheckCircle2 },
    FAIL: { cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20', Icon: XCircle },
    UNTESTED: { cls: 'bg-slate-800 text-slate-400 border-slate-700', Icon: CircleDashed }
  }[outcome];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-[11px] border ${style.cls}`}>
      <style.Icon className="h-3 w-3" />
      {outcome}
    </span>
  );
};

const FormatChip: React.FC<{ format: CredentialFormat }> = ({ format }) => (
  <span className={`px-2 py-0.5 rounded text-[11px] font-sans whitespace-nowrap ${
    format === 'sd-jwt' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-sky-500/20 text-sky-300'
  }`}>
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

const toMarkdown = (matrix: { combo: ReturnType<typeof allCombinations>[number]; run?: RunRecord }[], history: RunRecord[]) => {
  const row = (cells: (string | undefined)[]) => `| ${cells.map(c => (c ?? '').replace(/\|/g, '\\|')).join(' | ')} |`;
  const lines = [
    '# Interoperability Report',
    '',
    `Generated ${new Date().toISOString()} by the MOSIP VC Interoperability Playground.`,
    '',
    '## Matrix (latest clean run per combination)',
    '',
    row(['Issuer', 'Wallet', 'Verifier', 'Format', 'Proof type', 'Outcome', 'Error detail', 'Emulated sandbox']),
    row(['---', '---', '---', '---', '---', '---', '---', '---']),
    ...matrix.map(({ combo, run }) =>
      row([
        nodeLabel(combo.issuer), nodeLabel(combo.wallet), nodeLabel(combo.verifier), formatLabel(combo.format),
        run?.proofType, run?.outcome ?? 'UNTESTED', run?.errorDetail, run ? (run.sandboxFallback ? 'yes' : 'no') : ''
      ])
    ),
    '',
    '## All runs',
    '',
    row(['Time', 'Issuer', 'Wallet', 'Verifier', 'Format', 'Proof type', 'Mode', 'Verifier status', 'Outcome', 'Error detail', 'Transaction']),
    row(['---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---']),
    ...history.map(r =>
      row([
        r.finishedAt, nodeLabel(r.issuer), nodeLabel(r.wallet), nodeLabel(r.verifier), formatLabel(r.format), r.proofType,
        r.tampered ? 'tampered' : 'clean', r.verificationStatus, r.outcome, r.errorDetail, r.transactionId
      ])
    )
  ];
  return lines.join('\n') + '\n';
};

export const InteropMatrixReport: React.FC<InteropMatrixReportProps> = ({ history, onRunAll, batchProgress, busy, onClearHistory }) => {
  const [formatFilter, setFormatFilter] = useState<'all' | CredentialFormat>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | RunRecord['outcome']>('all');
  const [modeFilter, setModeFilter] = useState<'all' | 'clean' | 'tampered'>('all');

  // History is newest-first, so the first clean run seen per combination is the latest.
  const matrix = useMemo(() => {
    const latest = new Map<string, RunRecord>();
    for (const r of history) {
      if (!r.tampered && !latest.has(comboKey(r))) latest.set(comboKey(r), r);
    }
    return allCombinations().map(combo => ({ combo, run: latest.get(comboKey(combo)) }));
  }, [history]);

  const tested = matrix.filter(m => m.run);
  const passed = tested.filter(m => m.run!.outcome === 'PASS').length;
  const passRate = tested.length ? Math.round((passed / tested.length) * 100) : null;
  const negativeRuns = history.filter(r => r.tampered);
  const negativePassed = negativeRuns.filter(r => r.outcome === 'PASS').length;

  const filtered = history.filter(r =>
    (formatFilter === 'all' || r.format === formatFilter) &&
    (outcomeFilter === 'all' || r.outcome === outcomeFilter) &&
    (modeFilter === 'all' || (modeFilter === 'tampered') === r.tampered)
  );

  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const selectCls = 'bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200';
  const actionCls = 'px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-50';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white">Ecosystem Interoperability Certification Matrix</h2>
            {passRate !== null && (
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                passRate === 100 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                {passRate}% Pass Rate
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Results from actual playground runs between MOSIP reference implementations and independent OpenID4VCI / OpenID4VP engines.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 print:hidden">
          <button onClick={onRunAll} disabled={busy || !!batchProgress} className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-60">
            {batchProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {batchProgress ? `Running ${batchProgress.done}/${batchProgress.total}…` : 'Run All Combinations'}
          </button>
          <button onClick={() => download(`interop-report-${stamp}.md`, toMarkdown(matrix, history), 'text/markdown')} disabled={!history.length} className={actionCls}>
            <Download className="h-4 w-4 text-sky-400" /> Markdown
          </button>
          <button onClick={() => download(`interop-runs-${stamp}.json`, JSON.stringify(history, null, 2), 'application/json')} disabled={!history.length} className={actionCls}>
            <FileJson className="h-4 w-4 text-sky-400" /> JSON
          </button>
          <button onClick={() => window.print()} className={actionCls}>
            <Printer className="h-4 w-4 text-sky-400" /> Print
          </button>
          <button
            onClick={() => window.confirm('Clear all recorded runs from this browser?') && onClearHistory()}
            disabled={!history.length || !!batchProgress}
            className={actionCls}
          >
            <Trash2 className="h-4 w-4 text-rose-400" /> Clear
          </button>
        </div>
      </div>

      {/* Summary Scorecard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Combinations Tested</div>
          <div className="text-2xl font-bold text-white mt-1">{tested.length} / {matrix.length}</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Standards Profile</div>
          <div className="text-xs font-mono text-sky-400 mt-2">OpenID4VCI (Draft 13)<br />OpenID4VP (Draft 21)</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Negative-Path Runs</div>
          <div className="text-2xl font-bold text-white mt-1">
            {negativePassed} / {negativeRuns.length}
            <span className="text-xs font-normal text-slate-400 ml-2">correctly rejected</span>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-slate-950/70 border border-emerald-500/20 bg-emerald-950/10">
          <div className="text-xs text-emerald-400 font-medium">Cross-Interop Pass Rate</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
            <Award className="h-6 w-6" /> {passRate === null ? '—' : `${passRate}%`}
          </div>
        </div>
      </div>

      {/* Matrix */}
      <h3 className="text-sm font-semibold text-white mb-2">Matrix <span className="text-xs font-normal text-slate-400">— latest clean run per combination</span></h3>
      <div className="overflow-x-auto rounded-xl border border-slate-800 mb-8">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
            <tr>
              <th className="p-3">Issuer Node</th>
              <th className="p-3">Wallet / Holder</th>
              <th className="p-3">Verifier Node</th>
              <th className="p-3">Credential Format</th>
              <th className="p-3">Proof Type</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3">Error Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {matrix.map(({ combo, run }) => (
              <tr key={comboKey(combo)} className="hover:bg-slate-800/30 transition-colors">
                <td className="p-3 font-medium text-white">{nodeLabel(combo.issuer)}</td>
                <td className="p-3">{nodeLabel(combo.wallet)}</td>
                <td className="p-3">{nodeLabel(combo.verifier)}</td>
                <td className="p-3"><FormatChip format={combo.format} /></td>
                <td className="p-3 font-mono">{run?.proofType ?? '—'}</td>
                <td className="p-3 text-center">
                  <OutcomeBadge outcome={run?.outcome ?? 'UNTESTED'} />
                  {run?.sandboxFallback && <div className="text-[10px] text-amber-300 mt-1">emulated sandbox</div>}
                </td>
                <td className="p-3 text-rose-300 max-w-xs">{run?.errorDetail ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Run history */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold text-white">Run History <span className="text-xs font-normal text-slate-400">({filtered.length} of {history.length})</span></h3>
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
        </div>
      </div>
      {history.length === 0 ? (
        <p className="text-xs text-slate-400 p-6 text-center border border-dashed border-slate-800 rounded-xl">
          No runs yet. Run a flow in the Playground or click “Run All Combinations”.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">Issuer → Wallet → Verifier</th>
                <th className="p-3">Format</th>
                <th className="p-3">Proof</th>
                <th className="p-3">Mode</th>
                <th className="p-3">Verifier Status</th>
                <th className="p-3 text-center">Outcome</th>
                <th className="p-3">Error Detail</th>
                <th className="p-3">Transaction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="p-3 font-mono whitespace-nowrap">{new Date(r.finishedAt).toLocaleString()}</td>
                  <td className="p-3">{nodeLabel(r.issuer)} → {nodeLabel(r.wallet)} → {nodeLabel(r.verifier)}</td>
                  <td className="p-3"><FormatChip format={r.format} /></td>
                  <td className="p-3 font-mono">{r.proofType}</td>
                  <td className="p-3">{r.tampered ? <span className="text-rose-300">tampered</span> : 'clean'}</td>
                  <td className="p-3 font-mono">{r.verificationStatus ?? '—'}</td>
                  <td className="p-3 text-center"><OutcomeBadge outcome={r.outcome} /></td>
                  <td className="p-3 text-rose-300 max-w-xs">{r.errorDetail ?? ''}</td>
                  <td className="p-3 font-mono text-slate-500">{r.transactionId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
