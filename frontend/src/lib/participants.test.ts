import { describe, expect, it } from 'vitest';
import { chronological, participantOf, replaySlice } from './participants';
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

describe('replaySlice', () => {
  const logs = [makeLog({ step: 3 }), makeLog({ step: 2 }), makeLog({ step: 1 })];

  it('returns everything when live', () => {
    expect(replaySlice(logs, null)).toBe(logs);
  });

  it('keeps the first k protocol steps, newest-first', () => {
    expect(replaySlice(logs, 2).map(l => l.step)).toEqual([2, 1]);
    expect(replaySlice(logs, 1).map(l => l.step)).toEqual([1]);
  });

  it('clamps out-of-range positions', () => {
    expect(replaySlice(logs, 0)).toEqual([]);
    expect(replaySlice(logs, 9).map(l => l.step)).toEqual([3, 2, 1]);
  });
});
