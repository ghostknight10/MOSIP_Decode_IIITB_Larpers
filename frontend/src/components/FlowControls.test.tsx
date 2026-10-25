import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { activeTamper, buildOfferUri, buildVpRequestUri, FlowControls, QR_MAX_BYTES, summarise } from './FlowControls';
import { DEFAULT_SUBJECT } from '../config/nodes';
import { SCENARIOS } from '../config/scenarios';
import { RunInputs, VerificationResult } from '../types';

const OFFER = {
  credential_issuer: 'https://issuer.mock.mosip.net',
  credential_configuration_ids: ['NationalId_W3C_JSONLD'],
  grants: { 'urn:ietf:params:oauth:grant-type:pre-authorized_code': { 'pre-authorized_code': 'abc' } }
};

const W3C_VC = {
  type: ['VerifiableCredential', 'MosipNationalIdentityCredential'],
  issuer: { id: 'did:mosip:certify:sandbox:mock-issuer' },
  expirationDate: '2027-10-24T00:00:00.000Z',
  proof: { type: 'Ed25519Signature2020', verificationMethod: 'did:mosip:certify:sandbox:mock-issuer#key-1' }
};

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const SD_JWT = {
  rawToken: `${b64url({ alg: 'ES256' })}.${b64url({ iss: 'https://issuer.mock.mosip.net', vct: 'national-id', exp: 1800000000 })}.sig~disc1~disc2~`,
  decoded: { header: { alg: 'ES256' }, payload: { iss: 'https://issuer.mock.mosip.net' } }
};

const PD = { id: 'pres-def-1', input_descriptors: [{ id: 'national_id_credential' }] };

const verdict = (status: VerificationResult['status'], checks: Partial<VerificationResult['checks']> = {}): VerificationResult => ({
  status,
  checks: { formatCheck: true, signatureValid: true, notExpired: true, schemaCompliant: true, ...checks },
  details: `${status} details`,
  verifiedClaims: {}
});

const INITIAL_INPUTS: RunInputs = { subject: DEFAULT_SUBJECT, tamperMode: false, tamperOptions: { forceExpired: false, corruptSignature: false } };

type Props = React.ComponentProps<typeof FlowControls>;

/** FlowControls is controlled; the harness owns its inputs like App does. */
const Harness: React.FC<Omit<Props, 'inputs' | 'onInputsChange'>> = props => {
  const [inputs, setInputs] = useState<RunInputs>(INITIAL_INPUTS);
  return <FlowControls {...props} inputs={inputs} onInputsChange={setInputs} />;
};

const renderControls = (props: Partial<Props> = {}) => {
  const handlers = {
    onIssue: vi.fn().mockResolvedValue(undefined),
    onVerify: vi.fn().mockResolvedValue(undefined),
    onRunFullFlow: vi.fn().mockResolvedValue(undefined),
    onReset: vi.fn(),
    onRunScenario: vi.fn()
  };
  const user = userEvent.setup();
  render(
    <Harness
      {...handlers}
      phase="idle"
      transactionId={null}
      issuedCredential={null}
      credentialOffer={null}
      presentationDefinition={null}
      verificationResult={null}
      format="w3c-vc"
      verifier="inji-verify"
      {...props}
    />
  );
  return { ...handlers, user };
};

const issueButton = () => screen.getByRole('button', { name: /Issue Credential/ });
const verifyButton = () => screen.getByRole('button', { name: /Present & Verify/ });

describe('FlowControls actions', () => {
  it('issues with the default subject', async () => {
    const { onIssue, user } = renderControls();
    await user.click(issueButton());
    expect(onIssue).toHaveBeenCalledWith(DEFAULT_SUBJECT);
  });

  it('issues with edited subject claims', async () => {
    const { onIssue, user } = renderControls();
    await user.click(screen.getByRole('button', { name: /Credential subject claims/ }));
    const name = screen.getByLabelText('fullName');
    await user.clear(name);
    await user.type(name, 'Priya Rao');
    await user.click(issueButton());
    expect(onIssue).toHaveBeenCalledWith({ ...DEFAULT_SUBJECT, fullName: 'Priya Rao' });
  });

  it('cannot present before a credential is held', () => {
    renderControls();
    expect(verifyButton()).toBeDisabled();
  });

  it('presents without tampering by default', async () => {
    const { onVerify, user } = renderControls({ phase: 'issued', issuedCredential: W3C_VC });
    await user.click(verifyButton());
    expect(onVerify).toHaveBeenCalledWith(undefined);
  });

  it('passes the chosen tamper options when tamper mode is on', async () => {
    const { onVerify, user } = renderControls({ phase: 'issued', issuedCredential: W3C_VC });
    await user.click(screen.getByRole('button', { name: 'Enable Tamper Mode' }));
    expect(screen.getByRole('button', { name: /Tamper mode: on/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByLabelText('Corrupt Cryptographic Signature'));
    await user.click(verifyButton());
    expect(onVerify).toHaveBeenCalledWith({ forceExpired: false, corruptSignature: true });
  });

  it('drops tamper options again when tamper mode is switched off', async () => {
    const { onVerify, user } = renderControls({ phase: 'issued', issuedCredential: W3C_VC });
    await user.click(screen.getByRole('button', { name: 'Enable Tamper Mode' }));
    await user.click(screen.getByLabelText('Expire Timestamp (Negative Path)'));
    await user.click(screen.getByRole('button', { name: /Tamper mode: on/ }));
    await user.click(verifyButton());
    expect(onVerify).toHaveBeenCalledWith(undefined);
  });

  it('sends no tamper payload when tamper mode is on but nothing is ticked', async () => {
    const { onVerify, onRunFullFlow, user } = renderControls({ phase: 'issued', issuedCredential: W3C_VC });
    await user.click(screen.getByRole('button', { name: 'Enable Tamper Mode' }));
    await user.click(verifyButton());
    await user.click(screen.getByRole('button', { name: /Run Full Flow/ }));
    expect(onVerify).toHaveBeenCalledWith(undefined);
    expect(onRunFullFlow).toHaveBeenCalledWith(DEFAULT_SUBJECT, undefined);
  });

  it('runs the full flow with subject and tamper options', async () => {
    const { onRunFullFlow, user } = renderControls();
    await user.click(screen.getByRole('button', { name: 'Enable Tamper Mode' }));
    await user.click(screen.getByLabelText('Expire Timestamp (Negative Path)'));
    await user.click(screen.getByRole('button', { name: /Run Full Flow/ }));
    expect(onRunFullFlow).toHaveBeenCalledWith(DEFAULT_SUBJECT, { forceExpired: true, corruptSignature: false });
  });

  it('enables Reset only once a run has started', async () => {
    const { onReset, user } = renderControls({ phase: 'issued', issuedCredential: W3C_VC });
    await user.click(screen.getByRole('button', { name: /Reset/ }));
    expect(onReset).toHaveBeenCalled();
  });

  it('disables Reset when idle', () => {
    renderControls();
    expect(screen.getByRole('button', { name: /Reset/ })).toBeDisabled();
  });

  it.each(['issuing', 'verifying'] as const)('disables run buttons while %s', phase => {
    renderControls({ phase, issuedCredential: W3C_VC });
    for (const name of [/Issue Credential/, /Present & Verify/, /Run Full Flow/, /Reset/]) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });

  it('shows the transaction id of the current run', () => {
    renderControls({ transactionId: 'tx-deadbeef' });
    expect(screen.getByText('Transaction: tx-deadbeef')).toBeInTheDocument();
  });

  it('names the wire format being requested', () => {
    renderControls({ format: 'sd-jwt' });
    expect(screen.getByText('vc+sd-jwt')).toBeInTheDocument();
  });
});

describe('FlowControls QR codes', () => {
  it('renders a scannable credential offer QR and deep link', () => {
    renderControls({ phase: 'issued', credentialOffer: OFFER, issuedCredential: W3C_VC });
    const link = screen.getAllByRole('link', { name: 'Open on this device' })[0];
    expect(link.getAttribute('href')).toBe(buildOfferUri(OFFER));
    expect(document.querySelector('svg')).not.toBeNull();
  });

  it('copies the offer link to the clipboard', async () => {
    const { user } = renderControls({ phase: 'issued', credentialOffer: OFFER, issuedCredential: W3C_VC });
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await navigator.clipboard.readText()).toBe(buildOfferUri(OFFER));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('warns instead of rendering a QR when the payload is too large', () => {
    const huge = { ...OFFER, padding: 'x'.repeat(QR_MAX_BYTES) };
    renderControls({ phase: 'issued', credentialOffer: huge, issuedCredential: W3C_VC });
    expect(screen.getByText(/exceeds QR capacity/)).toBeInTheDocument();
    expect(document.querySelector('svg[height="132"]')).toBeNull();
  });

  it('notes when the issuer returned no credential offer', () => {
    renderControls({ phase: 'issued', issuedCredential: W3C_VC });
    expect(screen.getByText(/without a credential offer payload/)).toBeInTheDocument();
  });

  it('renders the OpenID4VP request with the verifier client_id and run nonce', () => {
    renderControls({
      phase: 'verified',
      issuedCredential: W3C_VC,
      presentationDefinition: PD,
      verificationResult: verdict('VALID'),
      transactionId: 'tx-12345678',
      verifier: 'mock-openid4vp'
    });
    const links = screen.getAllByRole('link', { name: 'Open on this device' });
    expect(links[0].getAttribute('href')).toBe(buildVpRequestUri(PD, 'https://verify.mock.mosip.net', 'tx-12345678'));
  });
});

describe('FlowControls credential summary', () => {
  it('summarises a W3C credential', () => {
    renderControls({ phase: 'issued', issuedCredential: W3C_VC });
    const summary = within(screen.getByText('Proof').closest('dl')!);
    expect(summary.getByText('ldp_vc')).toBeInTheDocument();
    expect(summary.getByText('Ed25519Signature2020')).toBeInTheDocument();
    expect(summary.getByText('did:mosip:certify:sandbox:mock-issuer')).toBeInTheDocument();
    expect(summary.getByText('MosipNationalIdentityCredential')).toBeInTheDocument();
    expect(summary.getByText('2027-10-24T00:00:00.000Z')).toBeInTheDocument();
  });

  it('summarises an SD-JWT credential from its token', () => {
    renderControls({ phase: 'issued', issuedCredential: SD_JWT, format: 'sd-jwt' });
    expect(screen.getByText('JWT (ES256)')).toBeInTheDocument();
    expect(screen.getByText('2 selective disclosures')).toBeInTheDocument();
    expect(screen.getByText(new Date(1800000000 * 1000).toISOString())).toBeInTheDocument();
  });
});

describe('FlowControls verification result', () => {
  it('shows a VALID verdict with all checks passing', () => {
    renderControls({ phase: 'verified', issuedCredential: W3C_VC, verificationResult: verdict('VALID') });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('VALID');
    expect(status).toHaveTextContent('VALID details');
    for (const check of ['Format', 'Signature', 'Not expired', 'Schema']) {
      expect(within(status).getByText(check)).toHaveClass('text-success-ink');
    }
  });

  it('labels an expired but correctly signed credential as Valid but Expired', () => {
    renderControls({ phase: 'failed', issuedCredential: W3C_VC, verificationResult: verdict('EXPIRED', { notExpired: false }) });
    expect(screen.getByText('Valid but Expired')).toBeInTheDocument();
    expect(screen.getByText('Not expired')).toHaveClass('text-danger-ink');
  });

  it('labels a signature mismatch and marks the failing check', () => {
    renderControls({ phase: 'failed', issuedCredential: W3C_VC, verificationResult: verdict('SIGNATURE_MISMATCH', { signatureValid: false }) });
    expect(screen.getByText('Signature mismatch')).toBeInTheDocument();
    expect(screen.getByText('Signature')).toHaveClass('text-danger-ink');
  });
});

describe('helpers', () => {
  it('encodes the credential offer by value', () => {
    const uri = buildOfferUri(OFFER);
    expect(uri.startsWith('openid-credential-offer://?credential_offer=')).toBe(true);
    expect(JSON.parse(decodeURIComponent(uri.split('credential_offer=')[1]))).toEqual(OFFER);
  });

  it('builds an OpenID4VP authorization request', () => {
    const url = new URL(buildVpRequestUri(PD, 'https://verifier', 'n-1').replace('openid4vp://', 'https://wallet/'));
    expect(url.searchParams.get('response_type')).toBe('vp_token');
    expect(url.searchParams.get('response_mode')).toBe('direct_post');
    expect(url.searchParams.get('client_id')).toBe('https://verifier');
    expect(url.searchParams.get('nonce')).toBe('n-1');
    expect(JSON.parse(url.searchParams.get('presentation_definition')!)).toEqual(PD);
  });

  it('tolerates malformed SD-JWT tokens', () => {
    expect(summarise({ rawToken: 'not-a-jwt' }, 'sd-jwt')).toMatchObject({ issuer: undefined, expires: undefined, extra: '0 selective disclosures' });
  });

  it('handles a string issuer and string type on W3C credentials', () => {
    expect(summarise({ issuer: 'did:example:1', type: 'X' }, 'w3c-vc')).toMatchObject({ issuer: 'did:example:1', type: 'X' });
  });
});

describe('FlowControls scenarios', () => {
  it('offers one button per documented scenario', () => {
    renderControls();
    const group = screen.getByRole('region', { name: 'Quick scenarios' });
    expect(within(group).getAllByRole('button')).toHaveLength(SCENARIOS.length);
    expect(within(group).getByRole('button', { name: /TC-03 Expired credential/ })).toHaveAccessibleDescription(/should reject it/);
  });

  it('runs the chosen scenario', async () => {
    const { onRunScenario, user } = renderControls();
    await user.click(screen.getByRole('button', { name: /TC-04/ }));
    expect(onRunScenario).toHaveBeenCalledWith(SCENARIOS.find(s => s.testCase === 'TC-04'));
  });

  it('disables scenarios while a run is in progress', () => {
    renderControls({ phase: 'issuing' });
    for (const b of within(screen.getByRole('region', { name: 'Quick scenarios' })).getAllByRole('button')) expect(b).toBeDisabled();
  });
});

describe('activeTamper', () => {
  const opts = (forceExpired: boolean, corruptSignature: boolean) => ({ forceExpired, corruptSignature });
  it.each([
    [false, opts(true, false), undefined],
    [true, opts(false, false), undefined],
    [true, opts(true, false), opts(true, false)],
    [true, opts(false, true), opts(false, true)]
  ])('tamperMode=%s %o -> %o', (tamperMode, tamperOptions, expected) => {
    expect(activeTamper({ subject: DEFAULT_SUBJECT, tamperMode, tamperOptions })).toEqual(expected);
  });
});
