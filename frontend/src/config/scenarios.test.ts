import { describe, expect, it } from 'vitest';
import { SCENARIOS } from './scenarios';
import { allCombinations, comboKey } from './nodes';

describe('SCENARIOS', () => {
  const valid = new Set(allCombinations().map(comboKey));

  it('uses unique ids and test case labels', () => {
    expect(new Set(SCENARIOS.map(s => s.id)).size).toBe(SCENARIOS.length);
    expect(new Set(SCENARIOS.map(s => s.testCase)).size).toBe(SCENARIOS.length);
  });

  it('only selects combinations the registry supports', () => {
    for (const s of SCENARIOS) expect(valid.has(comboKey(s.selection))).toBe(true);
  });

  it('covers TC-01 to TC-05 with clean and tampered runs', () => {
    expect(SCENARIOS.map(s => s.testCase.slice(0, 5))).toEqual(expect.arrayContaining(['TC-01', 'TC-02', 'TC-03', 'TC-04', 'TC-05']));
    expect(SCENARIOS.find(s => s.testCase === 'TC-03')?.tamper).toEqual({ forceExpired: true, corruptSignature: false });
    expect(SCENARIOS.find(s => s.testCase === 'TC-04')?.tamper).toEqual({ forceExpired: false, corruptSignature: true });
  });

  it('has presets for an independent (Walt.id) issuer and verifier', () => {
    const walt = SCENARIOS.filter(s => s.selection.issuer === 'walt-issuer' || s.selection.verifier === 'walt-verifier');
    expect(walt.map(s => s.testCase)).toEqual(['TC-10', 'TC-11']);
    expect(walt.every(s => s.selection.format === 'sd-jwt')).toBe(true);
  });

  it('has at least one cross-ecosystem scenario in each direction', () => {
    const cross = SCENARIOS.filter(s => s.testCase.startsWith('TC-05'));
    expect(cross.some(s => s.selection.issuer.startsWith('mock') && s.selection.verifier === 'inji-verify')).toBe(true);
    expect(cross.some(s => s.selection.issuer === 'inji-certify' && s.selection.verifier.startsWith('mock'))).toBe(true);
  });
});
