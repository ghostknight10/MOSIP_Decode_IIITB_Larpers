import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { columnStatus, MatrixSelector } from './MatrixSelector';
import { Selection } from '../hooks/usePlaygroundRun';
import { RunPhase } from '../types';

const selection: Selection = { issuer: 'inji-certify', wallet: 'inji-wallet', verifier: 'inji-verify', format: 'w3c-vc' };

const renderSelector = (props: Partial<React.ComponentProps<typeof MatrixSelector>> = {}) => {
  const onSelect = vi.fn();
  render(
    <MatrixSelector
      selection={selection}
      onSelect={onSelect}
      phase="idle"
      hasCredential={false}
      emulated={{ issuer: false, wallet: false, verifier: false }}
      {...props}
    />
  );
  return { onSelect };
};

const column = (name: string) => screen.getByRole('radiogroup', { name });

describe('MatrixSelector', () => {
  it('disables mDoc while Inji Verify is the verifier (its service accepts no mDoc)', () => {
    renderSelector();
    expect(screen.getByRole('radio', { name: /mDoc/ })).toBeDisabled();
  });

  it('offers mDoc with the mock verifier', () => {
    renderSelector({ selection: { ...selection, verifier: 'mock-openid4vp' } });
    expect(screen.getByRole('radio', { name: /mDoc/ })).toBeEnabled();
  });

  it('renders every registry node as a radio in its role column', () => {
    renderSelector();
    expect(within(column('Issuer')).getAllByRole('radio').map(r => r.textContent)).toEqual([
      expect.stringContaining('Inji Certify'),
      expect.stringContaining('Mock OpenID4VCI')
    ]);
    expect(within(column('Wallet')).getAllByRole('radio')).toHaveLength(2);
    expect(within(column('Verifier')).getAllByRole('radio')).toHaveLength(2);
    expect(within(column('Credential format')).getAllByRole('radio')).toHaveLength(3);
  });

  it('marks the current selection as checked', () => {
    renderSelector();
    expect(screen.getByRole('radio', { name: /Inji Certify/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Mock OpenID4VCI/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: /W3C VC/ })).toHaveAttribute('aria-checked', 'true');
  });

  it.each([
    [/Mock OpenID4VCI/, { issuer: 'mock-openid4vci' }],
    [/Simulated Holder/, { wallet: 'mock-wallet' }],
    [/Mock OpenID4VP/, { verifier: 'mock-openid4vp' }],
    [/SD-JWT VC/, { format: 'sd-jwt' }]
  ])('selecting %s calls onSelect with %o', async (name, patch) => {
    const { onSelect } = renderSelector();
    await userEvent.click(screen.getByRole('radio', { name }));
    expect(onSelect).toHaveBeenCalledWith(patch);
  });

  it.each(['issuing', 'verifying'] as RunPhase[])('locks every choice while %s', async phase => {
    const { onSelect } = renderSelector({ phase, hasCredential: phase === 'verifying' });
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /Mock OpenID4VCI/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows the live status of each role', () => {
    renderSelector({ phase: 'issued', hasCredential: true });
    expect(within(column('Issuer').parentElement!).getByText('Done')).toBeInTheDocument();
    expect(within(column('Wallet').parentElement!).getByText('Holding VC')).toBeInTheDocument();
    expect(within(column('Verifier').parentElement!).getByText('Standby')).toBeInTheDocument();
  });

  it('shows the verifier verdict once verification finishes', () => {
    renderSelector({ phase: 'failed', hasCredential: true, verificationStatus: 'SIGNATURE_MISMATCH' });
    expect(within(column('Verifier').parentElement!).getByText('SIGNATURE_MISMATCH')).toBeInTheDocument();
  });

  it('labels selected MOSIP nodes as Emulated when the sandbox fell back', () => {
    renderSelector({ emulated: { issuer: true, wallet: true, verifier: true } });
    expect(screen.getAllByText('Emulated')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /Mock OpenID4VCI/ })).toHaveTextContent('Custom Spec');
  });

  it('marks only the roles that were actually emulated', () => {
    renderSelector({ emulated: { issuer: true, wallet: false, verifier: false } });
    expect(screen.getByRole('radio', { name: /Inji Certify/ })).toHaveTextContent('Emulated');
    expect(screen.getByRole('radio', { name: /Inji Verify/ })).toHaveTextContent('MOSIP Collab');
  });

  it('never marks a non-MOSIP node as Emulated', () => {
    renderSelector({
      selection: { ...selection, issuer: 'mock-openid4vci' },
      emulated: { issuer: true, wallet: false, verifier: false }
    });
    expect(screen.queryByText('Emulated')).not.toBeInTheDocument();
  });

  it('shows vendor badges when not emulated', () => {
    renderSelector();
    expect(screen.queryByText('Emulated')).not.toBeInTheDocument();
    expect(screen.getAllByText('MOSIP Collab')).toHaveLength(2);
  });
});

describe('columnStatus', () => {
  // [phase, hasCredential, verification, issuer, wallet, verifier]
  it.each([
    ['idle', false, undefined, 'standby', 'standby', 'standby'],
    ['issuing', false, undefined, 'active', 'active', 'standby'],
    ['issued', true, undefined, 'done', 'holding', 'standby'],
    ['verifying', true, undefined, 'done', 'active', 'active'],
    ['verified', true, 'VALID', 'done', 'done', 'done'],
    ['failed', true, 'EXPIRED', 'done', 'done', 'rejected'],
    ['failed', true, undefined, 'done', 'failed', 'failed'],
    ['failed', false, undefined, 'failed', 'failed', 'standby']
  ] as const)('%s (credential=%s, verdict=%s) -> %s / %s / %s', (phase, cred, verdict, issuer, wallet, verifier) => {
    expect(columnStatus('issuer', phase, cred, verdict)).toBe(issuer);
    expect(columnStatus('wallet', phase, cred, verdict)).toBe(wallet);
    expect(columnStatus('verifier', phase, cred, verdict)).toBe(verifier);
  });
});
