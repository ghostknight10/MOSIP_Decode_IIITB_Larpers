import { afterEach, describe, expect, it, vi } from 'vitest';
import { base64UrlDecode, parseSdJwt, verifyDisclosureDigests } from './sdjwt';

const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const seg = (o: object) => b64url(JSON.stringify(o));
const sha256b64url = async (s: string) =>
  btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Exactly what backend/src/mocks/mockService.ts emits today.
const MOCK_DISCLOSURE = 'WyJzYWx0MSIsICJuYXRpb25hbElkIiwgIk1PU0lQLUlORC05ODc2LTU0MzItMTA5OCJd';
const MOCK_SD = ['W2E4dHJhX2Rpc2Nsb3N1cmVfMV0=', 'W2E4dHJhX2Rpc2Nsb3N1cmVfMl0='];
const mockToken = `${seg({ alg: 'ES256', typ: 'vc+sd-jwt' })}.${seg({ iss: 'https://issuer.mock.mosip.net', _sd_alg: 'sha-256', _sd: MOCK_SD })}.${b64url('sig')}~${MOCK_DISCLOSURE}~`;

afterEach(() => vi.unstubAllGlobals());

describe('base64UrlDecode', () => {
  it('decodes unpadded base64url, including UTF-8', () => {
    expect(base64UrlDecode(b64url('hi'))).toBe('hi');
    const utf8 = btoa(String.fromCharCode(...new TextEncoder().encode('é ✓'))).replace(/=+$/, '');
    expect(base64UrlDecode(utf8)).toBe('é ✓');
  });
});

describe('parseSdJwt', () => {
  it('splits the mock token into header, payload, signature and disclosures', () => {
    const p = parseSdJwt(mockToken)!;
    expect(p.header).toEqual({ alg: 'ES256', typ: 'vc+sd-jwt' });
    expect(p.payload._sd).toEqual(MOCK_SD);
    expect(p.signature).toBe(b64url('sig'));
    expect(p.disclosures).toEqual([{ raw: MOCK_DISCLOSURE, salt: 'salt1', name: 'nationalId', value: 'MOSIP-IND-9876-5432-1098' }]);
    expect(p.keyBinding).toBeNull();
  });

  it('reads array-element disclosures without a name', () => {
    const d = b64url(JSON.stringify(['s', 'FR']));
    expect(parseSdJwt(`${seg({})}.${seg({})}.x~${d}~`)!.disclosures[0]).toEqual({ raw: d, salt: 's', value: 'FR' });
  });

  it('flags malformed disclosures instead of throwing', () => {
    const p = parseSdJwt(`${seg({})}.${seg({})}.x~%%%~${b64url('[1]')}~`)!;
    expect(p.disclosures.map(d => d.error)).toEqual(['Not valid base64url JSON', 'Not a [salt, (name,) value] array']);
  });

  it('detects a trailing key-binding JWT', () => {
    const kb = `${seg({ typ: 'kb+jwt' })}.${seg({ nonce: 'n-1' })}.sig`;
    const p = parseSdJwt(`${seg({})}.${seg({})}.x~${MOCK_DISCLOSURE}~${kb}`)!;
    expect(p.disclosures).toHaveLength(1);
    expect(p.keyBinding).toEqual({ header: { typ: 'kb+jwt' }, payload: { nonce: 'n-1' } });
  });

  it('returns null when the issuer JWT is not decodable', () => {
    expect(parseSdJwt('nope')).toBeNull();
  });
});

describe('verifyDisclosureDigests', () => {
  it('reports that the mock disclosures are not committed in _sd', async () => {
    expect(await verifyDisclosureDigests(parseSdJwt(mockToken)!)).toEqual([false]);
  });

  it('confirms disclosures whose SHA-256 digest is in _sd', async () => {
    const d1 = b64url(JSON.stringify(['salt', 'fullName', 'Priya Rao']));
    const d2 = b64url(JSON.stringify(['salt2', 'dob', '2000-01-01']));
    const token = `${seg({ alg: 'ES256' })}.${seg({ _sd: [await sha256b64url(d1)] })}.x~${d1}~${d2}~`;
    expect(await verifyDisclosureDigests(parseSdJwt(token)!)).toEqual([true, false]);
  });

  it('is unavailable without WebCrypto', async () => {
    vi.stubGlobal('crypto', {});
    expect(await verifyDisclosureDigests(parseSdJwt(mockToken)!)).toBe('unavailable');
  });
});
