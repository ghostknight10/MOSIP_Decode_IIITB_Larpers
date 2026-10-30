import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DigitalCredentialsRequest } from './DigitalCredentialsRequest';

afterEach(() => {
  delete (window as any).DigitalCredential;
});

const props = { presentationDefinition: { id: 'pd-1' }, clientId: 'https://verify.mock.mosip.net', nonce: 'n-1' };
const supportWith = (get: ReturnType<typeof vi.fn>) => {
  (window as any).DigitalCredential = class {};
  Object.defineProperty(navigator, 'credentials', { value: { get }, configurable: true });
};

describe('DigitalCredentialsRequest', () => {
  it('explains plainly, and disables the button, where the API is missing', () => {
    render(<DigitalCredentialsRequest {...props} />);
    expect(screen.getByText(/Not available in this browser/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request with the browser' })).toBeDisabled();
  });

  it('asks the wallet and shows its raw answer', async () => {
    const get = vi.fn().mockResolvedValue({ protocol: 'openid4vp', data: { vp_token: 'wallet-token' } });
    supportWith(get);
    const user = userEvent.setup();
    render(<DigitalCredentialsRequest {...props} />);
    await user.click(screen.getByRole('button', { name: 'Request with the browser' }));
    expect(await screen.findByLabelText('Wallet response')).toHaveTextContent('wallet-token');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0].digital.requests[0].data).toMatchObject({ nonce: 'n-1', client_id: props.clientId });
  });

  it('says why a request failed', async () => {
    supportWith(vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' })));
    const user = userEvent.setup();
    render(<DigitalCredentialsRequest {...props} />);
    await user.click(screen.getByRole('button', { name: 'Request with the browser' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/declined, or no wallet/);
  });
});
