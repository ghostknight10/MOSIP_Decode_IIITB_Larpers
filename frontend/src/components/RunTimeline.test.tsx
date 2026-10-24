import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RunTimeline } from './RunTimeline';
import { makeLog } from '../test/fixtures';

// Newest-first, as stored by the hook; the emulated names are what the BFF sends on fallback.
const logs = [
  makeLog({ step: 4, sender: 'Wallet', receiver: 'Verifier (OpenID4VP)', protocol: 'OpenID4VP', action: 'VP Token Submission', status: 'FAILED', tampered: true }),
  makeLog({ step: 3, sender: 'Inji Verify (Collab Sandbox Emulated)', receiver: 'Wallet', protocol: 'OpenID4VP', action: 'Authorization Request' }),
  makeLog({ step: 1, sender: 'Wallet', receiver: 'Inji Certify (Collab Sandbox Emulated)', action: 'Fetch Credential Offer' })
];

const items = () => within(screen.getByRole('list', { name: 'Protocol steps' })).getAllByRole('listitem');

describe('RunTimeline', () => {
  it('lists steps in protocol order with numbered positions', () => {
    render(<RunTimeline logs={logs} />);
    expect(items().map(li => li.textContent)).toEqual([
      expect.stringContaining('Fetch Credential Offer'),
      expect.stringContaining('Authorization Request'),
      expect.stringContaining('VP Token Submission')
    ]);
    expect(items()[0]).toHaveTextContent(/^1/);
  });

  it('maps product names to roles, including emulated Inji services', () => {
    render(<RunTimeline logs={logs} />);
    expect(items()[0]).toHaveTextContent('Wallet → Issuer');
    expect(items()[1]).toHaveTextContent('Verifier → Wallet');
  });

  it('labels status and tampering in text, not only colour', () => {
    render(<RunTimeline logs={logs} />);
    expect(items()[0]).toHaveTextContent('Success');
    expect(items()[2]).toHaveTextContent('Failed');
    expect(items()[2]).toHaveTextContent('Tampered');
  });

  it('marks the last revealed step as current and the rest as not yet run', () => {
    render(<RunTimeline logs={logs} revealed={2} />);
    expect(items()[1]).toHaveAttribute('aria-current', 'step');
    expect(items()[2]).toHaveTextContent('Not yet');
    expect(items()[2]).not.toHaveTextContent('Tampered');
  });

  it('renders an empty list without logs', () => {
    render(<RunTimeline logs={[]} />);
    expect(screen.getByRole('list', { name: 'Protocol steps' })).toBeEmptyDOMElement();
  });
});
