import { NextFunction, Request, Response } from 'express';

/**
 * In-memory telemetry for the playground (bonus task): success rate and
 * latency per flow (issue, verify) and per Collab service. Counters never
 * reset; latencies keep the last RESERVOIR samples per series for percentiles.
 * Exposed as JSON and in the Prometheus text format, so any scraper (or Inji's
 * Obsrv pipeline) can ingest it. One process only; resets on restart.
 */

const RESERVOIR = 500;

interface Series {
  count: number;
  failures: number;
  emulated: number;
  sumMs: number;
  samples: number[];
}
const flows = new Map<string, { labels: Record<string, string>; series: Series; verdicts: Record<string, number> }>();
const services = new Map<string, Series>();
let since = new Date().toISOString();

const fresh = (): Series => ({ count: 0, failures: 0, emulated: 0, sumMs: 0, samples: [] });
const add = (s: Series, ms: number, failed: boolean, emulated = false) => {
  s.count += 1;
  s.failures += failed ? 1 : 0;
  s.emulated += emulated ? 1 : 0;
  s.sumMs += ms;
  s.samples.push(ms);
  if (s.samples.length > RESERVOIR) s.samples.shift();
};
const percentile = (samples: number[], p: number) => {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
const stats = (s: Series) => ({
  count: s.count,
  failures: s.failures,
  successRate: s.count ? Number(((s.count - s.failures) / s.count).toFixed(4)) : null,
  avgMs: s.count ? Math.round(s.sumMs / s.count) : 0,
  p50Ms: percentile(s.samples, 50),
  p95Ms: percentile(s.samples, 95)
});

/** One finished playground flow. `failed` means the BFF could not complete it (HTTP error); a verdict of INVALID is a result, not a failure. */
export function recordFlow(flow: 'issue' | 'verify', labels: Record<string, string>, ms: number, failed: boolean, emulated: boolean, verdict?: string) {
  const key = `${flow}|${Object.entries(labels).sort().map(([k, v]) => `${k}=${v}`).join(',')}`;
  const entry = flows.get(key) ?? { labels: { flow, ...labels }, series: fresh(), verdicts: {} };
  add(entry.series, ms, failed, emulated);
  if (verdict) entry.verdicts[verdict] = (entry.verdicts[verdict] ?? 0) + 1;
  flows.set(key, entry);
}

/** One call to a Collab service. Failure = unreachable or HTTP 5xx; 4xx answers (e.g. 403 without a token) are the service working. */
export function recordService(host: string, ms: number, failed: boolean) {
  const series = services.get(host) ?? fresh();
  add(series, ms, failed);
  services.set(host, series);
}

export function snapshot() {
  const all = [...flows.values()];
  const total = fresh();
  for (const { series } of all) {
    total.count += series.count;
    total.failures += series.failures;
    total.emulated += series.emulated;
    total.sumMs += series.sumMs;
    total.samples.push(...series.samples);
  }
  return {
    since,
    totals: { ...stats(total), emulatedShare: total.count ? Number((total.emulated / total.count).toFixed(4)) : 0 },
    flows: all.map(({ labels, series, verdicts }) => ({ ...labels, ...stats(series), emulated: series.emulated, verdicts })),
    services: [...services].map(([host, series]) => ({ host, ...stats(series) }))
  };
}

const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const labelText = (labels: Record<string, string>) => `{${Object.entries(labels).map(([k, v]) => `${k}="${esc(v)}"`).join(',')}}`;

/** Prometheus text exposition format (0.0.4). */
export function prometheus() {
  const out: string[] = [];
  const metric = (name: string, help: string, type: string) => out.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
  metric('playground_flow_requests_total', 'Playground issue and verify requests.', 'counter');
  for (const { labels, series } of flows.values()) out.push(`playground_flow_requests_total${labelText(labels)} ${series.count}`);
  metric('playground_flow_failures_total', 'Requests the BFF could not complete.', 'counter');
  for (const { labels, series } of flows.values()) out.push(`playground_flow_failures_total${labelText(labels)} ${series.failures}`);
  metric('playground_flow_emulated_total', 'Requests where the mock engine stood in for a Collab service.', 'counter');
  for (const { labels, series } of flows.values()) out.push(`playground_flow_emulated_total${labelText(labels)} ${series.emulated}`);
  metric('playground_flow_verdicts_total', 'Verifier verdicts per flow.', 'counter');
  for (const { labels, verdicts } of flows.values()) {
    for (const [verdict, n] of Object.entries(verdicts)) out.push(`playground_flow_verdicts_total${labelText({ ...labels, verdict })} ${n}`);
  }
  metric('playground_flow_duration_ms', 'Flow latency in milliseconds (recent samples).', 'summary');
  for (const { labels, series } of flows.values()) {
    for (const q of [0.5, 0.95]) out.push(`playground_flow_duration_ms${labelText({ ...labels, quantile: String(q) })} ${percentile(series.samples, q * 100)}`);
    out.push(`playground_flow_duration_ms_sum${labelText(labels)} ${series.sumMs}`, `playground_flow_duration_ms_count${labelText(labels)} ${series.count}`);
  }
  metric('playground_service_calls_total', 'Calls to MOSIP Collab services.', 'counter');
  for (const [host, series] of services) out.push(`playground_service_calls_total${labelText({ host })} ${series.count}`);
  metric('playground_service_failures_total', 'Collab calls that were unreachable or answered 5xx.', 'counter');
  for (const [host, series] of services) out.push(`playground_service_failures_total${labelText({ host })} ${series.failures}`);
  metric('playground_service_duration_ms', 'Collab call latency in milliseconds (recent samples).', 'summary');
  for (const [host, series] of services) {
    for (const q of [0.5, 0.95]) out.push(`playground_service_duration_ms${labelText({ host, quantile: String(q) })} ${percentile(series.samples, q * 100)}`);
    out.push(`playground_service_duration_ms_sum${labelText({ host })} ${series.sumMs}`, `playground_service_duration_ms_count${labelText({ host })} ${series.count}`);
  }
  return `${out.join('\n')}\n`;
}

export function resetMetrics() {
  flows.clear();
  services.clear();
  since = new Date().toISOString();
}

/** Records every request to the wrapped route once it has answered. */
export function trackFlow(flow: 'issue' | 'verify') {
  return (req: Request, res: Response, next: NextFunction) => {
    const started = Date.now();
    let body: any;
    const json = res.json.bind(res);
    res.json = (payload: unknown) => {
      body = payload;
      return json(payload);
    };
    res.on('finish', () => {
      const labels: Record<string, string> = {
        [flow === 'issue' ? 'issuer' : 'verifier']: String(req.body?.[flow === 'issue' ? 'issuer' : 'verifier'] ?? 'unknown'),
        format: String(req.body?.format ?? 'unknown')
      };
      recordFlow(flow, labels, Date.now() - started, res.statusCode >= 400, Boolean(body?.isSandboxFallback), body?.verificationResult?.status);
    });
    next();
  };
}
