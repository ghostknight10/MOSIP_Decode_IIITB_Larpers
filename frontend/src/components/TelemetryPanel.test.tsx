import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TelemetryPanel } from './TelemetryPanel';
import { api } from '../api/client';
import { Metrics } from '../types';

vi.mock('../api/client', () => ({ api: { metrics: vi.fn() } }));
const metricsMock = vi.mocked(api.metrics);

const stats = { count: 4, failures: 1, successRate: 0.75, avgMs: 1500, p50Ms: 900, p95Ms: 4200 };
const sample: Metrics = {
  since: '2026-10-30T10:00:00.000Z',
  totals: { ...stats, count: 6, successRate: 0.83, emulatedShare: 0.33 },
  flows: [{ ...stats, flow: 'verify', verifier: 'inji-verify', format: 'w3c-vc', emulated: 1, verdicts: { VALID: 3 } }],
  services: [{ ...stats, host: 'injiverify.collab.mosip.net', count: 7, failures: 0, successRate: 1, avgMs: 320, p95Ms: 610 }]
};

beforeEach(() => metricsMock.mockReset());

describe('TelemetryPanel', () => {
  it('shows totals, flows and Collab services with readable units', async () => {
    metricsMock.mockResolvedValue(sample);
    render(<TelemetryPanel />);
    expect(await screen.findByRole('heading', { name: 'Telemetry' })).toBeInTheDocument();
    expect(screen.getByText(/6 flow requests, 83% completed, 33% partly emulated/)).toBeInTheDocument();
    const flows = screen.getByRole('table', { name: 'Flows' });
    expect(within(flows).getByText(/Verify · Inji Verify/)).toBeInTheDocument();
    expect(within(flows).getByText('1.5 s')).toBeInTheDocument();
    expect(within(flows).getByText('4.2 s')).toBeInTheDocument();
    expect(within(flows).getByText('(1 emulated)')).toBeInTheDocument();
    const services = screen.getByRole('table', { name: 'MOSIP Collab services' });
    expect(within(services).getByText('injiverify.collab.mosip.net')).toBeInTheDocument();
    expect(within(services).getByText('320 ms')).toBeInTheDocument();
    expect(within(services).getByText('100%')).toBeInTheDocument();
  });

  it('says so before any flow has run', async () => {
    metricsMock.mockResolvedValue({ ...sample, flows: [], services: [], totals: { ...sample.totals, count: 0, successRate: null, emulatedShare: 0 } });
    render(<TelemetryPanel />);
    expect(await screen.findByText(/No flows yet/)).toBeInTheDocument();
  });

  it('refreshes on demand and when runs change', async () => {
    metricsMock.mockResolvedValue(sample);
    const user = userEvent.setup();
    const { rerender } = render(<TelemetryPanel refreshKey={1} />);
    await screen.findByRole('heading', { name: 'Telemetry' });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(metricsMock).toHaveBeenCalledTimes(2));
    rerender(<TelemetryPanel refreshKey={2} />);
    await waitFor(() => expect(metricsMock).toHaveBeenCalledTimes(3));
  });
});
