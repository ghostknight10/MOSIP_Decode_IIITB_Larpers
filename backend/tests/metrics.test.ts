import { beforeEach, describe, expect, it } from 'vitest';
import { prometheus, recordFlow, recordService, resetMetrics, snapshot } from '../src/utils/metrics.js';

beforeEach(resetMetrics);

describe('metrics', () => {
  it('reports success rate, emulation and latency percentiles per flow', () => {
    for (const ms of [100, 200, 300, 400]) recordFlow('verify', { verifier: 'inji-verify', format: 'w3c-vc' }, ms, false, false, 'VALID');
    recordFlow('verify', { verifier: 'inji-verify', format: 'w3c-vc' }, 900, true, true);
    const [flow] = snapshot().flows;
    expect(flow).toMatchObject({ flow: 'verify', verifier: 'inji-verify', count: 5, failures: 1, successRate: 0.8, emulated: 1, avgMs: 380, p50Ms: 300, p95Ms: 900, verdicts: { VALID: 4 } });
  });

  it('keeps series apart by labels and totals them', () => {
    recordFlow('issue', { issuer: 'mock-openid4vci', format: 'w3c-vc' }, 10, false, false);
    recordFlow('issue', { issuer: 'inji-certify', format: 'w3c-vc' }, 8000, false, true);
    const snap = snapshot();
    expect(snap.flows).toHaveLength(2);
    expect(snap.totals).toMatchObject({ count: 2, failures: 0, emulatedShare: 0.5 });
  });

  it('tracks Collab services by host', () => {
    recordService('injiverify.collab.mosip.net', 120, false);
    recordService('injiverify.collab.mosip.net', 480, true);
    expect(snapshot().services).toEqual([expect.objectContaining({ host: 'injiverify.collab.mosip.net', count: 2, failures: 1, avgMs: 300 })]);
  });

  it('reports an empty snapshot before any traffic', () => {
    expect(snapshot()).toMatchObject({ totals: { count: 0, successRate: null }, flows: [], services: [] });
  });

  it('writes the Prometheus text format with escaped labels', () => {
    recordFlow('verify', { verifier: 'a"b', format: 'w3c-vc' }, 50, false, false, 'VALID');
    recordService('esignet-mock.collab.mosip.net', 70, false);
    const text = prometheus();
    expect(text).toContain('# TYPE playground_flow_requests_total counter');
    expect(text).toContain('playground_flow_requests_total{flow="verify",verifier="a\\"b",format="w3c-vc"} 1');
    expect(text).toContain('playground_flow_verdicts_total{flow="verify",verifier="a\\"b",format="w3c-vc",verdict="VALID"} 1');
    expect(text).toContain('playground_service_duration_ms{host="esignet-mock.collab.mosip.net",quantile="0.95"} 70');
    expect(text.endsWith('\n')).toBe(true);
  });
});
