import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CredentialInspector } from './CredentialInspector';

const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const seg = (o: object) => b64url(JSON.stringify(o));
const MOCK_DISCLOSURE = 'WyJzYWx0MSIsICJuYXRpb25hbElkIiwgIk1PU0lQLUlORC05ODc2LTU0MzItMTA5OCJd';
const SD_JWT = {
  rawToken: `${seg({ alg: 'ES256', typ: 'vc+sd-jwt' })}.${seg({ iss: 'https://issuer.mock.mosip.net', _sd: ['placeholder'] })}.${b64url('sig')}~${MOCK_DISCLOSURE}~`
};
const W3C_VC = {
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  credentialSubject: { id: 'did:key:holder', fullName: 'Priya Rao', country: 'IND' },
  proof: { type: 'Ed25519Signature2020', proofValue: 'z3h' }
};

const open = async () => userEvent.click(screen.getByRole('button', { name: 'Inspect credential' }));

describe('CredentialInspector', () => {
  it('shows the decoded mDoc: docType, validity, elements and the CBOR', async () => {
    const user = userEvent.setup();
    const mdoc = {
      issuerSigned: 'o2ZzdGF0dXM',
      decoded: { docType: 'org.mosip.playground.nationalid.1', namespace: 'org.mosip.playground.1', claims: { fullName: 'A' }, validFrom: '2026-01-01T00:00:00Z', validUntil: '2027-01-01T00:00:00Z', alg: 'ES256' }
    };
    render(<CredentialInspector credential={mdoc} format="mso-mdoc" />);
    await user.click(screen.getByRole('button', { name: 'Inspect credential' }));
    expect(screen.getByText('org.mosip.playground.nationalid.1')).toBeInTheDocument();
    expect(screen.getByText('COSE_Sign1 · ES256 · x5chain')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Data elements' })).toHaveTextContent('fullName');
    expect(screen.getByText('o2ZzdGF0dXM')).toBeInTheDocument();
  });

  it('starts collapsed', () => {
    render(<CredentialInspector credential={W3C_VC} format="w3c-vc" />);
    expect(screen.getByRole('button', { name: 'Inspect credential' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Proof' })).not.toBeInTheDocument();
  });

  it('shows W3C subject claims (without the holder id) and the proof', async () => {
    render(<CredentialInspector credential={W3C_VC} format="w3c-vc" />);
    await open();
    const claims = within(screen.getByRole('region', { name: 'Subject claims' }));
    expect(claims.getByText('Subject claims (2)')).toBeInTheDocument();
    expect(claims.getByRole('rowheader', { name: 'fullName' })).toBeInTheDocument();
    expect(claims.queryByRole('rowheader', { name: 'id' })).not.toBeInTheDocument();
    expect(screen.getByText('did:key:holder')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Proof' })).getByText('"Ed25519Signature2020"')).toBeInTheDocument();
  });

  it('splits an SD-JWT into labelled parts', async () => {
    render(<CredentialInspector credential={SD_JWT} format="sd-jwt" />);
    await open();
    expect(screen.getByLabelText('Encoded SD-JWT')).toHaveTextContent(MOCK_DISCLOSURE);
    expect(within(screen.getByRole('list', { name: 'Token parts' })).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      '■ Header',
      '■ Payload',
      '■ Signature',
      '■ Disclosures'
    ]);
    expect(within(screen.getByRole('region', { name: 'Header' })).getByText('"vc+sd-jwt"')).toBeInTheDocument();
  });

  it('decodes disclosures and reports that the mock digests are not in _sd', async () => {
    render(<CredentialInspector credential={SD_JWT} format="sd-jwt" />);
    await open();
    const row = within(screen.getByRole('region', { name: 'Disclosures' })).getAllByRole('row')[1];
    expect(row).toHaveTextContent('nationalId');
    expect(row).toHaveTextContent('"MOSIP-IND-9876-5432-1098"');
    expect(row).toHaveTextContent('salt1');
    expect(await within(row).findByText('No')).toBeInTheDocument();
    expect(screen.getByText(/not committed in the payload's/)).toBeInTheDocument();
  });

  it('says when digest checks are unavailable', async () => {
    vi.stubGlobal('crypto', {});
    render(<CredentialInspector credential={SD_JWT} format="sd-jwt" />);
    await open();
    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('reports undecodable tokens', async () => {
    render(<CredentialInspector credential={{ rawToken: 'garbage' }} format="sd-jwt" />);
    await open();
    expect(screen.getByText('The SD-JWT could not be decoded.')).toBeInTheDocument();
  });
});
