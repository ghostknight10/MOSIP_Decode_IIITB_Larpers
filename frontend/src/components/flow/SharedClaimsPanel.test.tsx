import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SharedClaimsPanel } from './SharedClaimsPanel';

const PD = {
  input_descriptors: [{ constraints: { fields: [{ path: ['$.credentialSubject.fullName'] }, { path: ['$.credentialSubject.nationalId'] }] } }]
};
const VC = { credentialSubject: { id: 'did:h', fullName: 'A', nationalId: '1', dob: 'x', email: 'e' } };

const group = (name: string) => within(screen.getByRole('group', { name }));

describe('SharedClaimsPanel', () => {
  it('summarises who holds how many claims', () => {
    render(<SharedClaimsPanel presentationDefinition={PD} credential={VC} format="w3c-vc" verifiedClaims={{ fullName: 'A', nationalId: '1' }} />);
    expect(screen.getByRole('region', { name: 'What was shared' })).toHaveTextContent(
      'Issuer signed 4 claims → wallet holds 4 → verifier asked for 2 and received 2.'
    );
  });

  it('shows perfect minimisation without warnings', () => {
    render(<SharedClaimsPanel presentationDefinition={PD} credential={VC} format="w3c-vc" verifiedClaims={{ fullName: 'A', nationalId: '1' }} />);
    expect(group('Requested and shared').getAllByRole('listitem').map(li => li.textContent)).toEqual(['fullName', 'nationalId']);
    expect(group('Kept private').getAllByRole('listitem').map(li => li.textContent)).toEqual(['dob', 'email']);
    expect(group('Shared without being requested').getByText('None')).toBeInTheDocument();
    expect(screen.queryByText(/did not ask for/)).not.toBeInTheDocument();
  });

  it('flags over-disclosure, as the mock verifier currently returns the whole subject', () => {
    render(<SharedClaimsPanel presentationDefinition={PD} credential={VC} format="w3c-vc" verifiedClaims={VC.credentialSubject} />);
    expect(group('Shared without being requested').getAllByRole('listitem').map(li => li.textContent)).toEqual(['dob', 'email']);
    expect(group('Kept private').getByText('None')).toBeInTheDocument();
    expect(screen.getByText(/received 2 claims it did not ask for/)).toBeInTheDocument();
  });

  it('lists requested claims the verifier never received', () => {
    render(<SharedClaimsPanel presentationDefinition={PD} credential={VC} format="w3c-vc" verifiedClaims={{ fullName: 'A' }} />);
    expect(group('Requested but not shared').getAllByRole('listitem').map(li => li.textContent)).toEqual(['nationalId']);
  });

  it('labels every group in text with a count', () => {
    render(<SharedClaimsPanel presentationDefinition={null} credential={null} format="w3c-vc" verifiedClaims={null} />);
    for (const name of ['Requested and shared (0)', 'Shared without being requested (0)', 'Requested but not shared (0)', 'Kept private (0)']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });
});
