import { describe, expect, it } from 'vitest';
import {
  allCombinations,
  comboKey,
  DEFAULT_SUBJECT,
  FORMATS,
  formatLabel,
  getNode,
  ISSUERS,
  nodeLabel,
  VERIFIERS,
  WALLETS
} from './nodes';

describe('node registry', () => {
  it('assigns each node the role of the list it lives in', () => {
    expect(ISSUERS.every(n => n.role === 'issuer')).toBe(true);
    expect(WALLETS.every(n => n.role === 'wallet')).toBe(true);
    expect(VERIFIERS.every(n => n.role === 'verifier')).toBe(true);
  });

  it('has unique ids across all roles', () => {
    const ids = [...ISSUERS, ...WALLETS, ...VERIFIERS].map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes at least one MOSIP and one non-MOSIP node per role', () => {
    for (const list of [ISSUERS, WALLETS, VERIFIERS]) {
      expect(list.some(n => n.isMosip)).toBe(true);
      expect(list.some(n => !n.isMosip)).toBe(true);
    }
  });

  it('gives every verifier an OpenID4VP client_id', () => {
    expect(VERIFIERS.every(v => v.clientId?.startsWith('https://'))).toBe(true);
  });

  it('maps formats to their OpenID4VCI wire format', () => {
    expect(FORMATS.find(f => f.id === 'w3c-vc')?.wireFormat).toBe('ldp_vc');
    expect(FORMATS.find(f => f.id === 'sd-jwt')?.wireFormat).toBe('vc+sd-jwt');
  });

  it('provides a complete default credential subject', () => {
    expect(Object.values(DEFAULT_SUBJECT).every(v => v.length > 0)).toBe(true);
  });
});

describe('lookups', () => {
  it('finds nodes by id and falls back to the raw id for unknown labels', () => {
    expect(getNode('inji-verify')?.label).toBe('Inji Verify');
    expect(getNode('nope')).toBeUndefined();
    expect(nodeLabel('mock-openid4vci')).toBe('Mock OpenID4VCI');
    expect(nodeLabel('nope')).toBe('nope');
  });

  it('labels formats', () => {
    expect(formatLabel('sd-jwt')).toBe('SD-JWT VC');
    expect(formatLabel('w3c-vc')).toBe('W3C VC (JSON-LD)');
  });
});

describe('allCombinations', () => {
  it('produces the full issuer x wallet x verifier x format product', () => {
    const combos = allCombinations();
    expect(combos).toHaveLength(ISSUERS.length * WALLETS.length * VERIFIERS.length * FORMATS.length);
    expect(new Set(combos.map(comboKey)).size).toBe(combos.length);
  });

  it('builds stable keys from the four selection fields', () => {
    expect(comboKey({ issuer: 'a', wallet: 'b', verifier: 'c', format: 'd' })).toBe('a|b|c|d');
  });
});
