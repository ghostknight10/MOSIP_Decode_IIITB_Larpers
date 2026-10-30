import { describe, expect, it } from 'vitest';
import { credentialText, decodeQr, encodeForQr } from './pixelpass';
import { QR_MAX_BYTES } from './credential';

const vc = {
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: ['VerifiableCredential', 'MosipNationalIdentityCredential'],
  issuer: 'did:key:z6MkwFwAq2Gok6rgVtp1XQkbVCpnU8JZ47wkJbeMoTWmcqct',
  credentialSubject: { fullName: 'Aaditya Sharma', nationalId: 'MOSIP-IND-9876-5432-1098', dob: '1995-08-15', country: 'IND' },
  proof: { type: 'Ed25519Signature2020', proofValue: `z${'3hWb23'.repeat(20)}` }
};

describe('credentialText', () => {
  it('picks the right text for each format', () => {
    expect(credentialText(vc)).toBe(JSON.stringify(vc));
    expect(credentialText({ rawToken: 'a.b.c~d~' })).toBe('a.b.c~d~');
    expect(credentialText({ issuerSigned: 'o2Zz' })).toBe('o2Zz');
    expect(credentialText('plain~')).toBe('plain~');
  });
});

describe('encodeForQr (PixelPass)', () => {
  it('compresses a W3C credential well below its JSON size and decodes back', async () => {
    const result = await encodeForQr(vc);
    expect(result.encodedBytes).toBeLessThan(result.rawBytes);
    expect(result.fits).toBe(true);
    expect(JSON.parse(await decodeQr(result.data))).toEqual(vc);
  });

  it('round-trips an SD-JWT token (text, not JSON)', async () => {
    const token = `eyJhbGciOiJFUzI1NiJ9.${'eyJpc3MiOiJ4In0'.repeat(10)}.sig~WyJzIiwibiIsInYiXQ~`;
    const result = await encodeForQr({ rawToken: token });
    expect(await decodeQr(result.data)).toBe(token);
  });

  it('reports when even the compressed form is too big for one QR code', async () => {
    // Incompressible text: a linear congruential generator, so the test is deterministic.
    let state = 12345;
    const noise = Array.from({ length: QR_MAX_BYTES * 2 }, () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return String.fromCharCode(33 + (state >> 8) % 90);
    }).join('');
    const result = await encodeForQr({ rawToken: noise });
    expect(result.fits).toBe(false);
    expect(result.encodedBytes).toBeGreaterThan(QR_MAX_BYTES);
  });
});
