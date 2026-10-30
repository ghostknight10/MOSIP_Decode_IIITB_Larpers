import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelemetryPanel } from './TelemetryPanel';

afterEach(() => vi.unstubAllGlobals());

describe('TelemetryPanel against a BFF without the endpoint', () => {
  it('renders nothing for a payload that is not metrics', async () => {
    const fetchFn = vi.fn(async () => new Response('{"status":"healthy"}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchFn);
    const { container } = render(<TelemetryPanel />);
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing instead of an error', async () => {
    const fetchFn = vi.fn(async () => new Response('{"error":"Not found"}', { status: 404, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchFn);
    const { container } = render(<TelemetryPanel />);
    await waitFor(() => expect(fetchFn).toHaveBeenCalledWith('/api/playground/metrics', expect.anything()));
    expect(container).toBeEmptyDOMElement();
  });
});
