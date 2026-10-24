import { describe, expect, it } from 'vitest';
import { fallbackNotice } from './fallback';

const sel = { issuer: 'inji-certify', verifier: 'inji-verify' } as const;

describe('fallbackNotice', () => {
  it('returns null when nothing was emulated', () => {
    expect(fallbackNotice(sel, false, false)).toBeNull();
  });

  it('names the issuer when only issuance was emulated', () => {
    expect(fallbackNotice(sel, true, false)).toBe('MOSIP Collab sandbox unreachable: Inji Certify responses are emulated by the mock engine.');
  });

  it('names the verifier when only verification was emulated', () => {
    expect(fallbackNotice(sel, false, true)).toBe('MOSIP Collab sandbox unreachable: Inji Verify responses are emulated by the mock engine.');
  });

  it('names both when both phases were emulated', () => {
    expect(fallbackNotice(sel, true, true)).toBe(
      'MOSIP Collab sandbox unreachable: Inji Certify and Inji Verify responses are emulated by the mock engine.'
    );
  });
});
