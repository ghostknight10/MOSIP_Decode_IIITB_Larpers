import { describe, expect, it } from 'vitest';
import { chronological, participantOf } from './participants';
import { makeLog } from '../test/fixtures';

describe('participantOf', () => {
  it.each([
    ['Verifier (OpenID4VP)', 'Verifier'],
    ['Inji Verify (Collab Sandbox Emulated)', 'Verifier'],
    ['Issuer (OpenID4VCI)', 'Issuer'],
    ['Inji Certify (Collab Sandbox Emulated)', 'Issuer'],
    ['Wallet', 'Wallet'],
    ['Simulated Holder', 'Wallet'],
    ['Mimoto', 'Wallet'],
    ['BFF', null]
  ])('%s -> %s', (name, role) => {
    expect(participantOf(name)).toBe(role);
  });
});

describe('chronological', () => {
  it('reverses newest-first logs without mutating them', () => {
    const logs = [makeLog({ step: 2 }), makeLog({ step: 1 })];
    expect(chronological(logs).map(l => l.step)).toEqual([1, 2]);
    expect(logs.map(l => l.step)).toEqual([2, 1]);
  });
});
