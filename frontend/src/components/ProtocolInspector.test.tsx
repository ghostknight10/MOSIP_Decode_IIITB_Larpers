import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProtocolInspector } from './ProtocolInspector';
import { makeLog } from '../test/fixtures';

const logs = [
  makeLog({
    id: 'vp',
    step: 4,
    action: 'VP Token Submission',
    status: 'FAILED',
    sender: 'Wallet',
    receiver: 'Verifier (OpenID4VP)',
    durationMs: 110,
    request: { method: 'POST', url: 'https://verify.mock.mosip.net/vp-response', body: { vp_token: 'tok' } },
    response: { status: 400, body: { status: 'SIGNATURE_MISMATCH' } }
  }),
  makeLog({ id: 'offer', step: 1, action: 'Fetch Credential Offer' })
];

const renderInspector = (props: Partial<React.ComponentProps<typeof ProtocolInspector>> = {}) => {
  const user = userEvent.setup();
  render(<ProtocolInspector logs={logs} {...props} />);
  return { user };
};

const payload = () => document.querySelector('pre')!.textContent!;

describe('ProtocolInspector', () => {
  it('shows an empty state without logs', () => {
    render(<ProtocolInspector logs={[]} />);
    expect(screen.getByText(/No protocol traffic logged yet/)).toBeInTheDocument();
    expect(screen.getByText('0 Transactions Logged')).toBeInTheDocument();
    expect(screen.getByText(/Select a transaction/)).toBeInTheDocument();
  });

  it('lists each log with step, status, route and duration', () => {
    renderInspector();
    expect(screen.getByText('2 Transactions Logged')).toBeInTheDocument();
    expect(screen.getByText('Step 4')).toBeInTheDocument();
    expect(screen.getByText('FAILED')).toBeInTheDocument();
    expect(screen.getByText('Wallet → Verifier (OpenID4VP)')).toBeInTheDocument();
    expect(screen.getByText('110ms')).toBeInTheDocument();
  });

  it('inspects the first (newest) log response by default', () => {
    renderInspector();
    expect(screen.getByRole('button', { name: 'Response Body (400)' })).toBeInTheDocument();
    expect(JSON.parse(payload())).toEqual({ status: 'SIGNATURE_MISMATCH' });
  });

  it('switches to another log when clicked', async () => {
    const { user } = renderInspector();
    await user.click(screen.getByRole('button', { name: /Fetch Credential Offer/ }));
    expect(JSON.parse(payload())).toEqual({ credential_issuer: 'https://issuer.mock.mosip.net' });
  });

  it('shows the full request on the request tab', async () => {
    const { user } = renderInspector();
    await user.click(screen.getByRole('button', { name: /^Request \(POST/ }));
    expect(JSON.parse(payload())).toMatchObject({ method: 'POST', body: { vp_token: 'tok' } });
  });

  it('copies the visible payload as JSON', async () => {
    const { user } = renderInspector();
    await user.click(screen.getByRole('button', { name: /Copy JSON/ }));
    expect(JSON.parse(await navigator.clipboard.readText())).toEqual({ status: 'SIGNATURE_MISMATCH' });
    expect(screen.getByRole('button', { name: /Copied!/ })).toBeInTheDocument();
  });

  it('clears history through the callback', async () => {
    const onClearLogs = vi.fn();
    const { user } = renderInspector({ onClearLogs });
    await user.click(screen.getByRole('button', { name: 'Clear History' }));
    expect(onClearLogs).toHaveBeenCalled();
  });

  it('hides Clear History without a callback', () => {
    renderInspector();
    expect(screen.queryByRole('button', { name: 'Clear History' })).not.toBeInTheDocument();
  });

  it('renders request and response HTTP headers when present', () => {
    const logWithHeaders = makeLog({
      response: {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-trace-id': 'tr-1234' },
        body: { ok: true }
      }
    });
    renderInspector({ logs: [logWithHeaders] });
    expect(screen.getByText('Response Headers')).toBeInTheDocument();
    expect(screen.getByText('content-type:')).toBeInTheDocument();
    expect(screen.getByText('application/json')).toBeInTheDocument();
    expect(screen.getByText('x-trace-id:')).toBeInTheDocument();
    expect(screen.getByText('tr-1234')).toBeInTheDocument();
  });
});
