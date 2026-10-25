import { describe, expect, it } from 'vitest';
import { parseImportedCredential } from './importCredential';

const b64 = (v: unknown) => btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const VC = { '@context': ['https://www.w3.org/2018/credentials/v1'], type: ['VerifiableCredential'], credentialSubject: { UIN: '42' }, proof: { type: 'Ed25519Signature2020' } };

describe('parseImportedCredential', () => {
  it('reads a W3C credential, bare or wrapped', () => {
    expect(parseImportedCredential(JSON.stringify(VC))).toEqual({ format: 'w3c-vc', credential: VC });
    expect(parseImportedCredential(JSON.stringify({ credential: VC }))).toEqual({ format: 'w3c-vc', credential: VC });
    expect(parseImportedCredential(JSON.stringify({ verifiableCredential: [VC] }))).toEqual({ format: 'w3c-vc', credential: VC });
  });

  it('reads an SD-JWT and decodes its disclosed claims', () => {
    const token = `${b64({ alg: 'ES256', typ: 'vc+sd-jwt' })}.${b64({ iss: 'https://issuer', vct: 'Id', exp: 1 })}.sig~${b64(['s', 'fullName', 'A'])}~`;
    const result = parseImportedCredential(`  ${token}\n`);
    expect(result).toMatchObject({
      format: 'sd-jwt',
      credential: { rawToken: token, decoded: { header: { alg: 'ES256' }, payload: { iss: 'https://issuer', vct: 'Id', claims: { fullName: 'A' } } } }
    });
  });

  it.each([
    ['', 'Paste a credential first.'],
    ['{bad', 'does not parse'],
    ['{"credentialSubject":{}}', 'credentialSubject and proof'],
    ['hello', 'Not a W3C credential']
  ])('explains why %j cannot be imported', (text, message) => {
    expect((parseImportedCredential(text) as { error: string }).error).toContain(message);
  });
});
