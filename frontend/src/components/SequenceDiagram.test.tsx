import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import mermaid from 'mermaid';
import { SequenceDiagram } from './SequenceDiagram';
import { makeLog } from '../test/fixtures';

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: vi.fn() }
}));

const renderMock = vi.mocked(mermaid.render);

beforeEach(() => {
  renderMock.mockReset().mockResolvedValue({ svg: '<svg data-testid="sequence-svg"></svg>', diagramType: 'sequence' } as any);
  vi.mocked(mermaid.initialize).mockClear();
});

const lastDiagram = () => renderMock.mock.calls.at(-1)![1];

// Newest-first, as the run hook stores them.
const logs = [
  makeLog({ step: 4, sender: 'Wallet', receiver: 'Verifier (OpenID4VP)', action: 'VP Token Submission (/response)', status: 'FAILED', tampered: true }),
  makeLog({ step: 3, sender: 'Verifier (OpenID4VP)', receiver: 'Wallet', action: 'Authorization Request (Presentation Definition)' }),
  makeLog({ step: 1, sender: 'Wallet', receiver: 'Issuer (OpenID4VCI)', action: 'Fetch Credential Offer' })
];

describe('SequenceDiagram', () => {
  it('initialises mermaid once with the dark theme', () => {
    const { rerender } = render(<SequenceDiagram logs={[]} />);
    rerender(<SequenceDiagram logs={logs} />);
    expect(mermaid.initialize).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mermaid.initialize).mock.calls[0][0]).toMatchObject({ startOnLoad: false, theme: 'dark' });
  });

  it('shows a placeholder and skips rendering when there are no logs', () => {
    render(<SequenceDiagram logs={[]} />);
    expect(screen.getByText('No sequence events recorded yet.')).toBeInTheDocument();
    expect(renderMock).not.toHaveBeenCalled();
  });

  it('renders the mermaid SVG into the panel', async () => {
    render(<SequenceDiagram logs={logs} />);
    expect(await screen.findByTestId('sequence-svg')).toBeInTheDocument();
  });

  it('draws messages chronologically between the right participants', () => {
    render(<SequenceDiagram logs={logs} />);
    const lines = lastDiagram().split('\n').filter((l: string) => l.includes('->>'));
    expect(lines).toEqual([
      '  Wallet->>Issuer: Fetch Credential Offer [✓ SUCCESS]',
      '  Verifier->>Wallet: Authorization Request Presentation Definition [✓ SUCCESS]',
      '  Wallet->>Verifier: VP Token Submission response [✗ FAILED]'
    ]);
  });

  it('declares the three protocol participants', () => {
    render(<SequenceDiagram logs={logs} />);
    expect(lastDiagram()).toMatch(/^sequenceDiagram\n  autonumber/);
    expect(lastDiagram()).toContain('participant Issuer as Issuer (OpenID4VCI)');
    expect(lastDiagram()).toContain('participant Verifier as Verifier (OpenID4VP)');
  });

  it('annotates tampered steps', () => {
    render(<SequenceDiagram logs={logs} />);
    expect(lastDiagram()).toContain('Note over Verifier: ⚠️ Tampered Payload Detected!');
  });

  it('strips characters that would break mermaid syntax from actions', () => {
    render(<SequenceDiagram logs={[makeLog({ action: 'POST /credential; drop: "x" <b>' })]} />);
    expect(lastDiagram()).toContain(': POST credential drop x b [');
  });

  it('re-renders when logs change', () => {
    const { rerender } = render(<SequenceDiagram logs={logs.slice(2)} />);
    rerender(<SequenceDiagram logs={logs} />);
    expect(renderMock).toHaveBeenCalledTimes(2);
  });

  it('reports render failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderMock.mockRejectedValue(new Error('parse error'));
    render(<SequenceDiagram logs={logs} />);
    await waitFor(() => expect(screen.getByText('Failed to render sequence graph')).toBeInTheDocument());
  });

  it('identifies emulated Inji Verify participant correctly (Bug F-1)', () => {
    const emulatedLog = makeLog({
      step: 3,
      sender: 'Inji Verify (Collab Sandbox Emulated)',
      receiver: 'Wallet',
      action: 'Authorization Request'
    });
    render(<SequenceDiagram logs={[emulatedLog]} />);
    expect(lastDiagram()).toContain('  Verifier->>Wallet: Authorization Request [✓ SUCCESS]');
  });
});
