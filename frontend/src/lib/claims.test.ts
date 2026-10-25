import { describe, expect, it } from 'vitest';
import { claimAliases, classifyClaims, claimFromPath, heldClaims, requestedClaims, sharedClaims } from './claims';

const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const seg = (o: object) => b64url(JSON.stringify(o));

// Shape the mock verifier sends (backend/src/mocks/mockService.ts).
const PD = {
  input_descriptors: [
    {
      constraints: {
        fields: [{ path: ['$.credentialSubject.fullName', '$.fullName'] }, { path: ['$.credentialSubject.nationalId', '$.nationalId'] }]
      }
    }
  ]
};

describe('claimFromPath', () => {
  it.each([
    ['$.credentialSubject.fullName', 'fullName'],
    ['$.nationalId', 'nationalId'],
    ["$['credentialSubject']['dob']", 'dob'],
    ['$.vc.credentialSubject["email"]', 'email']
  ])('%s -> %s', (path, claim) => {
    expect(claimFromPath(path)).toBe(claim);
  });
});

describe('requestedClaims', () => {
  it('reads the first path of each constraint field', () => {
    expect(requestedClaims(PD)).toEqual(['fullName', 'nationalId']);
  });

  it('de-duplicates across descriptors and tolerates missing pieces', () => {
    const pd = { input_descriptors: [...PD.input_descriptors, { constraints: { fields: [{ path: ['$.fullName'] }, {}] } }, {}] };
    expect(requestedClaims(pd)).toEqual(['fullName', 'nationalId']);
    expect(requestedClaims(null)).toEqual([]);
  });
});

describe('heldClaims', () => {
  it('lists W3C subject claims without the holder id', () => {
    expect(heldClaims({ credentialSubject: { id: 'did:x', fullName: 'A', dob: 'B' } }, 'w3c-vc')).toEqual(['fullName', 'dob']);
  });

  it('combines SD-JWT payload claims and disclosure names, skipping registered claims', () => {
    const d = b64url(JSON.stringify(['salt', 'email', 'a@b.c']));
    const raw = `${seg({ alg: 'ES256' })}.${seg({ iss: 'x', iat: 1, exp: 2, vct: 'v', _sd: [], _sd_alg: 'sha-256', fullName: 'A' })}.s~${d}~`;
    expect(heldClaims({ rawToken: raw }, 'sd-jwt')).toEqual(['fullName', 'email']);
  });

  it('falls back to decoded claims when there is no raw token', () => {
    expect(heldClaims({ decoded: { payload: { claims: { id: 'x', country: 'IND' } } } }, 'sd-jwt')).toEqual(['country']);
  });

  it('returns nothing for an empty credential', () => {
    expect(heldClaims(null, 'w3c-vc')).toEqual([]);
  });
});

describe('sharedClaims', () => {
  it('lists received claims without identifiers', () => {
    expect(sharedClaims({ id: 'did:x', fullName: 'A' })).toEqual(['fullName']);
    expect(sharedClaims(undefined)).toEqual([]);
    expect(sharedClaims('nope')).toEqual([]);
  });
});

describe('classifyClaims', () => {
  it('separates requested, over-shared, missing and private claims', () => {
    expect(classifyClaims(['fullName', 'nationalId'], ['fullName', 'nationalId', 'dob', 'email'], ['fullName', 'dob'])).toEqual({
      requestedShared: ['fullName'],
      overShared: ['dob'],
      missing: ['nationalId'],
      keptPrivate: ['nationalId', 'email']
    });
  });

  it('reports perfect minimisation when exactly the requested claims are shared', () => {
    const c = classifyClaims(['a'], ['a', 'b'], ['a']);
    expect(c.overShared).toEqual([]);
    expect(c.missing).toEqual([]);
    expect(c.keptPrivate).toEqual(['b']);
  });
});

describe('claim aliases (G-6)', () => {
  const pd = {
    input_descriptors: [{ constraints: { fields: [
      { path: ['$.credentialSubject.fullName', '$.fullName'] },
      { path: ['$.credentialSubject.nationalId', '$.nationalId', '$.credentialSubject.UIN', '$.UIN'] }
    ] } }]
  };

  it('maps alternative names to the first name of each field', () => {
    expect(claimAliases(pd)).toEqual({ UIN: 'nationalId' });
    expect(requestedClaims(pd)).toEqual(['fullName', 'nationalId']);
  });

  it('counts a claim shared under an alias as the requested one', () => {
    const shared = sharedClaims({ fullName: 'A', UIN: '42' }, claimAliases(pd));
    expect(shared).toEqual(['fullName', 'nationalId']);
    expect(classifyClaims(requestedClaims(pd), ['fullName', 'nationalId', 'email'], shared)).toMatchObject({
      requestedShared: ['fullName', 'nationalId'],
      overShared: [],
      missing: []
    });
  });
});
