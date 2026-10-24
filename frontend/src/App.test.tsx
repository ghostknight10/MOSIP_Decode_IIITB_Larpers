import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { allCombinations } from './config/nodes';
import { makeLog } from './test/fixtures';

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: vi.fn().mockResolvedValue({ svg: '<svg></svg>' }) }
}));

type Handler = (body: any, txId: string) => { status?: number; body: unknown };

/** Minimal BFF stand-in: routes fetch calls to per-endpoint handlers. */
const stubBff = (overrides: Partial<Record<'health' | 'issue' | 'verify' | 'logs', Handler>> = {}) => {
  const handlers: Record<string, Handler> = {
    health: () => ({ body: { status: 'healthy' } }),
    issue: (_b, tx) => ({
      body: {
        success: true,
        credentialOffer: { credential_issuer: 'https://issuer.mock.mosip.net' },
        issuedCredential: { type: ['VerifiableCredential'], proof: { type: 'Ed25519Signature2020' } },
        protocolLogs: [makeLog({ transactionId: tx, step: 1 }), makeLog({ transactionId: tx, step: 2 })]
      }
    }),
    verify: (b, tx) => {
      const tampered = Boolean(b.tamperPayload?.corruptSignature);
      return {
        body: {
          success: true,
          verificationResult: {
            status: tampered ? 'SIGNATURE_MISMATCH' : 'VALID',
            checks: { formatCheck: true, signatureValid: !tampered, notExpired: true, schemaCompliant: true },
            details: tampered ? 'Proof signature does not match' : 'All checks passed',
            verifiedClaims: {}
          },
          presentationDefinition: { id: 'pd' },
          protocolLogs: [1, 2, 3, 4].map(step => makeLog({ transactionId: tx, step, tampered: tampered && step === 4 }))
        }
      };
    },
    logs: () => ({ body: { success: true } }),
    ...overrides
  };
  const fetchFn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const key = url === '/api/health' ? 'health' : url.split('/').pop()!;
    const tx = (init.headers as Record<string, string>)?.['x-transaction-id'];
    const { status = 200, body } = handlers[key](init.body ? JSON.parse(init.body as string) : undefined, tx);
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fetchFn);
  return fetchFn;
};

beforeEach(() => {
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

const setup = () => {
  const user = userEvent.setup();
  render(<App />);
  return { user };
};

describe('App', () => {
  it('reports the BFF as online once the health check succeeds', async () => {
    stubBff();
    setup();
    expect(await screen.findByText('Online (Collab/Mock)')).toBeInTheDocument();
  });

  it('reports the BFF as offline when it cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    setup();
    expect(await screen.findByText('Offline')).toBeInTheDocument();
  });

  it('runs issue -> present -> verify end to end', async () => {
    const fetchFn = stubBff();
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: /Issue Credential/ }));
    expect(await screen.findByText('Holding VC')).toBeInTheDocument();
    expect(screen.getByText('2 Transactions Logged')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Present & Verify/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('VALID');
    expect(screen.getByText('4 Transactions Logged')).toBeInTheDocument();

    // Both calls share one transaction id.
    const txIds = fetchFn.mock.calls
      .filter(([url]) => url.startsWith('/api/playground/'))
      .map(([, init]) => (init!.headers as Record<string, string>)['x-transaction-id']);
    expect(new Set(txIds).size).toBe(1);
  });

  it('records runs in the report, including tampered ones', async () => {
    stubBff();
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: /Run Full Flow/ }));
    await screen.findByRole('status');
    await user.click(screen.getByRole('button', { name: 'Enable Tamper Mode' }));
    await user.click(screen.getByLabelText('Corrupt Cryptographic Signature'));
    await user.click(screen.getByRole('button', { name: /Run Full Flow/ }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('SIGNATURE_MISMATCH'));

    await user.click(screen.getByRole('button', { name: /Interop Matrix Report/ }));
    expect(screen.getByText(`1 / ${allCombinations().length}`)).toBeInTheDocument();
    expect(screen.getByText('Real: 1/1 pass')).toBeInTheDocument();
    const history = screen.getAllByRole('table')[1];
    expect(within(history).getAllByText('PASS')).toHaveLength(2);
    expect(within(history).getByText('tampered')).toBeInTheDocument();
  });

  it('shows the backend error when issuance fails', async () => {
    stubBff({ issue: () => ({ status: 500, body: { success: false, error: 'Inji Certify rejected the request' } }) });
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Issue Credential/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Inji Certify rejected the request');
  });

  it('warns when the sandbox responses were emulated', async () => {
    stubBff({
      issue: (_b, tx) => ({
        body: {
          success: true,
          isSandboxFallback: true,
          notice: 'Collab unreachable',
          credentialOffer: {},
          issuedCredential: { proof: { type: 'X' } },
          protocolLogs: [makeLog({ transactionId: tx })]
        }
      })
    });
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Issue Credential/ }));
    expect(await screen.findByText('MOSIP Collab sandbox unreachable: Inji Certify responses are emulated by the mock engine.')).toBeInTheDocument();
    expect(screen.queryByText(/Collab unreachable/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Emulated').length).toBeGreaterThan(0);
  });

  it('runs every combination from the report', async () => {
    const fetchFn = stubBff();
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Interop Matrix Report/ }));
    await user.click(screen.getByRole('button', { name: /Run All Combinations/ }));

    const total = allCombinations().length;
    await waitFor(() => expect(screen.getByText(`${total} / ${total}`)).toBeInTheDocument(), { timeout: 5000 });
    expect(fetchFn.mock.calls.filter(([url]) => url === '/api/playground/verify')).toHaveLength(total);
    expect(screen.getByRole('button', { name: /Run All Combinations/ })).toBeEnabled();
  });

  it('clears logs from the inspector', async () => {
    const fetchFn = stubBff();
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Issue Credential/ }));
    await screen.findByText('2 Transactions Logged');
    await user.click(screen.getByRole('button', { name: 'Clear History' }));
    expect(await screen.findByText(/No run yet/)).toBeInTheDocument();
    expect(screen.queryByText(/Transactions Logged/)).not.toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledWith('/api/playground/logs', expect.objectContaining({ method: 'DELETE' }));
  });

  it('shows one compact empty state instead of empty panels before any run', async () => {
    stubBff();
    setup();
    expect(screen.getByText(/No run yet/)).toBeInTheDocument();
    expect(screen.queryByText(/Transactions Logged/)).not.toBeInTheDocument();
    expect(screen.queryByText('Live Dynamic Sequence Visualizer')).not.toBeInTheDocument();
  });

  it('shows the current run only, with a toggle for all runs', async () => {
    stubBff();
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Run Full Flow/ }));
    await screen.findByText('4 Transactions Logged');
    await user.click(screen.getByRole('button', { name: /Run Full Flow/ }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'All runs (2)' })).toBeInTheDocument());

    expect(screen.getByText('4 Transactions Logged')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Protocol steps' })).getAllByRole('listitem')).toHaveLength(4);

    await user.click(screen.getByRole('radio', { name: 'All runs (2)' }));
    expect(screen.getByText('8 Transactions Logged')).toBeInTheDocument();
  });
});
