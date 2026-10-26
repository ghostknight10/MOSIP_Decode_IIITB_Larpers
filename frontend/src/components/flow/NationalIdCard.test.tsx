import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NationalIdCard } from './NationalIdCard';

const SAMPLE_W3C_VC = {
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: ['VerifiableCredential', 'MosipNationalIdentityCredential'],
  issuer: 'https://issuer.mock.mosip.net',
  credentialSubject: {
    nationalId: 'MOSIP-IND-9876-5432-1098',
    fullName: 'Aaditya Sharma',
    dob: '1995-08-15',
    country: 'IND'
  }
};

describe('NationalIdCard', () => {
  it('renders the person identity attributes and card structure', () => {
    render(<NationalIdCard credential={SAMPLE_W3C_VC} format="w3c-vc" />);
    expect(screen.getByText('Aaditya Sharma')).toBeInTheDocument();
    expect(screen.getByText('MOSIP-IND-9876-5432-1098')).toBeInTheDocument();
    expect(screen.getByText('1995-08-15')).toBeInTheDocument();
    expect(screen.getByText('IND')).toBeInTheDocument();
    expect(screen.getByText('Cryptographically Signed')).toBeInTheDocument();
  });

  it('opens and closes the simulated mobile wallet modal on button click', () => {
    render(<NationalIdCard credential={SAMPLE_W3C_VC} format="w3c-vc" />);
    const mobileBtn = screen.getByRole('button', { name: /Mobile Wallet View/i });
    expect(mobileBtn).toBeInTheDocument();

    // Open modal
    fireEvent.click(mobileBtn);
    expect(screen.getByRole('dialog', { name: /Mobile Wallet Simulator/i })).toBeInTheDocument();
    expect(screen.getByText('Inji Mobile Wallet')).toBeInTheDocument();

    // Close modal
    const closeBtn = screen.getByRole('button', { name: /Close Phone View/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole('dialog', { name: /Mobile Wallet Simulator/i })).not.toBeInTheDocument();
  });
});
