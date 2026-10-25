import { describe, expect, it } from 'vitest';
import { fallbackNotice } from './fallback';

const sel = { issuer: 'inji-certify', verifier: 'inji-verify' } as const;

describe('fallbackNotice', () => {
  it('returns null when nothing was emulated', () => {
    expect(fallbackNotice(sel, false, false)).toBeNull();
  });

  it('names the issuer when only issuance was emulated', () => {
    expect(fallbackNotice(sel, true, false)).toBe('Emulated in this run: Inji Certify responses come from the mock engine.');
  });

  it('names the verifier when only verification was emulated', () => {
    expect(fallbackNotice(sel, false, true)).toBe('Emulated in this run: Inji Verify responses come from the mock engine.');
  });

  it('names both when both phases were emulated', () => {
    expect(fallbackNotice(sel, true, true)).toBe(
      'Emulated in this run: Inji Certify and Inji Verify responses come from the mock engine.'
    );
  });
});
