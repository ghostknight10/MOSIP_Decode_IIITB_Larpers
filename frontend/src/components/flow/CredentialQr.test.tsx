import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CredentialQr } from './CredentialQr';

const vc = { '@context': ['https://www.w3.org/2018/credentials/v1'], type: ['VerifiableCredential'], credentialSubject: { fullName: 'Aaditya Sharma' }, proof: { type: 'Ed25519Signature2020', proofValue: `z${'ab'.repeat(60)}` } };

describe('CredentialQr', () => {
  it('is collapsed until asked for', () => {
    render(<CredentialQr credential={vc} />);
    expect(screen.getByRole('button', { name: /Credential as a QR code/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('credential-qr')).not.toBeInTheDocument();
  });

  it('shows the QR code and how much PixelPass saved', async () => {
    const user = userEvent.setup();
    render(<CredentialQr credential={vc} />);
    await user.click(screen.getByRole('button', { name: /Credential as a QR code/ }));
    expect(await screen.findByTestId('credential-qr')).toBeInTheDocument();
    expect(screen.getByText(/bytes as issued/)).toHaveTextContent(/smaller/);
    expect(screen.getByText(/Scan QR Code/)).toBeInTheDocument();
  });

  it('copies the encoded text', async () => {
    const user = userEvent.setup();
    render(<CredentialQr credential={vc} />);
    await user.click(screen.getByRole('button', { name: /Credential as a QR code/ }));
    await user.click(await screen.findByRole('button', { name: 'Copy encoded text' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect((await navigator.clipboard.readText()).length).toBeGreaterThan(20);
  });

  it('warns when the credential is still too big for one QR code', async () => {
    const user = userEvent.setup();
    let state = 99;
    const noise = Array.from({ length: 7000 }, () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return String.fromCharCode(33 + (state >> 8) % 90);
    }).join('');
    render(<CredentialQr credential={{ rawToken: noise }} />);
    await user.click(screen.getByRole('button', { name: /Credential as a QR code/ }));
    expect(await screen.findByText(/Still too big for one QR code/)).toBeInTheDocument();
    expect(screen.queryByTestId('credential-qr')).not.toBeInTheDocument();
  });
});
