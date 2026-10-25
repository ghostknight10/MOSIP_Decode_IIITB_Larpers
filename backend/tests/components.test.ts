import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearComponentCache, componentFingerprints } from '../src/services/components.js';

vi.mock('axios', async importOriginal => {
  const actual = await importOriginal<typeof import('axios')>();
  return { ...actual, default: { ...actual.default, get: vi.fn() } };
});
const getMock = vi.mocked(axios.get);

const answer = (routes: Record<string, { status: number; data?: unknown }>) =>
  getMock.mockImplementation((async (url: string) => {
    const match = Object.keys(routes).find(part => url.includes(part));
    if (!match) throw new Error(`unexpected ${url}`);
    return routes[match];
  }) as any);

beforeEach(() => {
  clearComponentCache();
  getMock.mockReset();
  delete process.env.COLLAB_TEST_INDIVIDUAL_ID;
});

describe('componentFingerprints', () => {
  it('records the API generation, UI build, protocol and content hashes', async () => {
    answer({
      '/v2/vc-verification': { status: 405 },
      'asset-manifest.json': { status: 200, data: { files: { 'main.js': '/static/js/main.8b11a4ad.js' } } },
      'openid-credential-issuer': { status: 200, data: { nonce_endpoint: 'https://x/nonce', credential_configurations_supported: {} } },
      '/mimoto/issuers': { status: 200, data: { response: { issuers: [{ issuer_id: 'Mosip' }] } } }
    });
    const result = await componentFingerprints();
    expect(result.injiVerify).toEqual({ api: 'v2', uiBuild: '8b11a4ad' });
    expect(result.injiCertify).toMatchObject({ url: 'https://injicertify-mosipid.collab.mosip.net', protocol: 'OpenID4VCI 1.0', metadata: expect.stringMatching(/^[0-9a-f]{8}$/) });
    expect(result.label).toMatch(/^Verify v2·ui 8b11a4ad \| Certify 1\.0·[0-9a-f]{8} \| Mimoto [0-9a-f]{8}$/);
  });

  it('detects v1-only Inji Verify and a Draft 13 issuer', async () => {
    answer({
      '/v2/vc-verification': { status: 404 },
      'asset-manifest.json': { status: 404 },
      'openid-credential-issuer': { status: 200, data: { credential_configurations_supported: {} } },
      '/mimoto/issuers': { status: 500 }
    });
    const result = await componentFingerprints();
    expect(result.injiVerify).toEqual({ api: 'v1', uiBuild: 'unknown' });
    expect(result.injiCertify.protocol).toBe('OpenID4VCI Draft 13');
    expect(result.mimoto.registry).toBe('unknown');
  });

  it('fingerprints the login Certify when real issuance is configured', async () => {
    process.env.COLLAB_TEST_INDIVIDUAL_ID = '8267411578';
    answer({ '': { status: 404 } });
    expect((await componentFingerprints()).injiCertify.url).toBe('https://injicertify-landregistry.collab.mosip.net');
  });

  it('caches the result for repeated calls', async () => {
    answer({ '': { status: 404 } });
    await componentFingerprints();
    const calls = getMock.mock.calls.length;
    await componentFingerprints();
    expect(getMock.mock.calls.length).toBe(calls);
  });

  it('marks unreachable services instead of failing', async () => {
    getMock.mockRejectedValue(new Error('ENOTFOUND'));
    const result = await componentFingerprints();
    expect(result.injiVerify.api).toBe('unreachable');
    expect(result.mimoto.registry).toBe('unreachable');
  });
});
