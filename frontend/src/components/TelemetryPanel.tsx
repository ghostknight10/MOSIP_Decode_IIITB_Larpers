import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { Metrics, SeriesStats } from '../types';
import { nodeLabel } from '../config/nodes';
import { btnSmall, panel } from './ui';

const pct = (rate: number | null) => (rate === null ? '—' : `${Math.round(rate * 100)}%`);
const ms = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${value} ms`);

const StatCells: React.FC<{ s: SeriesStats }> = ({ s }) => (
  <>
    <td className="p-2 font-mono">{s.count}</td>
    <td className="p-2 font-mono">{pct(s.successRate)}</td>
    <td className="p-2 font-mono">{ms(s.avgMs)}</td>
    <td className="p-2 font-mono">{ms(s.p95Ms)}</td>
  </>
);

const Head: React.FC<{ first: string }> = ({ first }) => (
  <thead className="bg-surface-muted text-ink-muted text-xs font-medium">
    <tr>
      <th scope="col" className="p-2 font-medium">{first}</th>
      <th scope="col" className="p-2 font-medium">Requests</th>
      <th scope="col" className="p-2 font-medium">Completed</th>
      <th scope="col" className="p-2 font-medium">Average</th>
      <th scope="col" className="p-2 font-medium">Slowest 5%</th>
    </tr>
  </thead>
);

/**
 * Telemetry from the BFF: how many flows ran, how many the BFF completed, and
 * how long they and each Collab service took. "Completed" means the request
 * was answered (a verifier saying INVALID still counts: that is a result).
 */
export const TelemetryPanel: React.FC<{ refreshKey?: number }> = ({ refreshKey = 0 }) => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    api.metrics().then(
      m => live && (setMetrics(m), setFailed(false)),
      () => live && setFailed(true)
    );
    return () => {
      live = false;
    };
  }, [refreshKey, tick]);

  if (failed && !metrics) return null; // an older BFF without the endpoint: show nothing
  if (!metrics) return null;

  return (
    <section aria-labelledby="telemetry-heading" className={`${panel} p-4 sm:p-5 mb-5 print:hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-4 border-b border-line">
        <div>
          <h2 id="telemetry-heading" className="text-base font-semibold text-ink">Telemetry</h2>
          <p className="text-xs text-ink-muted">
            Since the BFF started {new Date(metrics.since).toLocaleString()}: {metrics.totals.count} flow requests, {pct(metrics.totals.successRate)} completed, {pct(metrics.totals.emulatedShare)} partly emulated.
            Also available to scrapers as Prometheus text at <span className="font-mono">/api/playground/metrics?format=prometheus</span>.
          </p>
        </div>
        <button type="button" onClick={() => setTick(t => t + 1)} className={btnSmall}>
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Refresh
        </button>
      </div>

      {metrics.flows.length === 0 && metrics.services.length === 0 ? (
        <p className="text-xs text-ink-muted">No flows yet. Run one from the Playground tab.</p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Flows</caption>
              <Head first="Flow" />
              <tbody className="divide-y divide-line text-ink">
                {metrics.flows.map(f => (
                  <tr key={`${f.flow}|${f.issuer ?? f.verifier}|${f.format}`}>
                    <th scope="row" className="p-2 font-normal">
                      {f.flow === 'issue' ? 'Issue' : 'Verify'} · {nodeLabel(f.issuer ?? f.verifier ?? 'unknown')} · <span className="font-mono">{f.format}</span>
                      {f.emulated > 0 && <span className="text-ink-subtle"> ({f.emulated} emulated)</span>}
                    </th>
                    <StatCells s={f} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">MOSIP Collab services</caption>
              <Head first="Collab service" />
              <tbody className="divide-y divide-line text-ink">
                {metrics.services.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-2 text-ink-muted">No Collab calls yet.</td>
                  </tr>
                )}
                {metrics.services.map(s => (
                  <tr key={s.host}>
                    <th scope="row" className="p-2 font-mono font-normal">{s.host}</th>
                    <StatCells s={s} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
