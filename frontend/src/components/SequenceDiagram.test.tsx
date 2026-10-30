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
  makeLog({ step: 4, protocol: 'OpenID4VP', sender: 'Wallet', receiver: 'Verifier (OpenID4VP)', action: 'VP Token Submission (/response)', status: 'FAILED', tampered: true }),
  makeLog({ step: 3, protocol: 'OpenID4VP', sender: 'Verifier (OpenID4VP)', receiver: 'Wallet', action: 'Authorization Request (Presentation Definition)' }),
  makeLog({ step: 1, sender: 'Wallet', receiver: 'Issuer (OpenID4VCI)', action: 'Fetch Credential Offer' })
];

describe('SequenceDiagram', () => {
  it('initialises mermaid once with the light token theme', () => {
    const { rerender } = render(<SequenceDiagram logs={[]} />);
    rerender(<SequenceDiagram logs={logs} />);
    expect(mermaid.initialize).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mermaid.initialize).mock.calls[0][0]).toMatchObject({ startOnLoad: false, theme: 'base', themeVariables: { background: '#ffffff', primaryTextColor: '#1b1e24' } });
  });

  it('reads the active theme tokens, and draws again in the new colours when the theme changes', () => {
    const root = document.documentElement;
    const { rerender } = render(<SequenceDiagram logs={logs} theme="light" />);
    expect(vi.mocked(mermaid.initialize).mock.calls.at(-1)![0]).toMatchObject({ themeVariables: { primaryTextColor: '#1b1e24', background: '#ffffff' } });

    root.style.setProperty('--color-ink', '#eceef2');
    root.style.setProperty('--color-surface', '#1a1d24');
    root.style.setProperty('--color-warning-soft', '#2b2210');
    rerender(<SequenceDiagram logs={logs} theme="dark" />);
    expect(mermaid.initialize).toHaveBeenCalledTimes(2);
    expect(vi.mocked(mermaid.initialize).mock.calls.at(-1)![0]).toMatchObject({ themeVariables: { primaryTextColor: '#eceef2', background: '#1a1d24', sequenceNumberColor: '#1a1d24' } });
    expect(renderMock).toHaveBeenCalledTimes(2);
    expect(lastDiagram()).toContain('rect rgb(43, 34, 16)');

    ['--color-ink', '--color-surface', '--color-warning-soft'].forEach(name => root.style.removeProperty(name));
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
    expect(lastDiagram()).toContain('Note over Verifier: Tampered payload');
    expect(lastDiagram()).toContain('rect rgb(255, 245, 227)');
  });

  it('notes each protocol phase once per run', () => {
    render(<SequenceDiagram logs={logs} />);
    const notes = lastDiagram().split('\n').filter((l: string) => l.includes('Note over Issuer,Verifier'));
    expect(notes).toEqual(['  Note over Issuer,Verifier: OpenID4VCI', '  Note over Issuer,Verifier: OpenID4VP']);
  });

  it('keeps each run contiguous when showing several transactions', () => {
    // Newest-first: run B (issue only) arrived after run A finished.
    const all = [
      makeLog({ transactionId: 'tx-b', step: 1, action: 'B issue' }),
      makeLog({ transactionId: 'tx-a', step: 4, protocol: 'OpenID4VP', sender: 'Wallet', receiver: 'Verifier (OpenID4VP)', action: 'A present' }),
      makeLog({ transactionId: 'tx-a', step: 1, action: 'A issue' })
    ];
    render(<SequenceDiagram logs={all} />);
    const lines = lastDiagram().split('\n').filter((l: string) => l.includes('->>') || l.includes('Note over Issuer'));
    expect(lines).toEqual([
      '  Note over Issuer,Verifier: OpenID4VCI · tx-a',
      '  Wallet->>Issuer: A issue [✓ SUCCESS]',
      '  Note over Issuer,Verifier: OpenID4VP · tx-a',
      '  Wallet->>Verifier: A present [✓ SUCCESS]',
      '  Note over Issuer,Verifier: OpenID4VCI · tx-b',
      '  Wallet->>Issuer: B issue [✓ SUCCESS]'
    ]);
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
