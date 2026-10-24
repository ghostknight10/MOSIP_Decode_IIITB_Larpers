import { describe, expect, it } from 'vitest';
import { failureLayer, LAYERS, shortLayer } from './failureLayer';
import { makeRun } from '../test/fixtures';

describe('failureLayer', () => {
  it('is null for passing runs, including correct rejections of tampered credentials', () => {
    expect(failureLayer(makeRun())).toBeNull();
    expect(failureLayer(makeRun({ tampered: true, verificationStatus: 'EXPIRED', failedChecks: ['notExpired'] }))).toBeNull();
  });

  it.each([
    [{ errorDetail: 'Issuance failed: getaddrinfo ENOTFOUND' }, 'Technical'],
    [{ errorDetail: 'Verification failed: timeout' }, 'Technical'],
    [{ tampered: true, verificationStatus: 'VALID' as const }, 'Technical'],
    [{ verificationStatus: 'SIGNATURE_MISMATCH' as const, failedChecks: ['signatureValid' as const] }, 'Technical'],
    [{ verificationStatus: 'INVALID' as const, failedChecks: ['formatCheck' as const] }, 'Syntactical'],
    [{ verificationStatus: 'INVALID' as const, failedChecks: ['schemaCompliant' as const] }, 'Semantic'],
    [{ verificationStatus: 'EXPIRED' as const, failedChecks: ['notExpired' as const] }, 'Organizational'],
    [{ verificationStatus: 'INVALID' as const }, 'Unclassified']
  ])('%o -> %s', (overrides, layer) => {
    expect(failureLayer(makeRun({ outcome: 'FAIL', ...overrides }))).toBe(layer);
  });

  it('reports the lowest broken layer when several checks fail', () => {
    expect(failureLayer(makeRun({ outcome: 'FAIL', failedChecks: ['notExpired', 'schemaCompliant', 'formatCheck'] }))).toBe('Syntactical');
    expect(failureLayer(makeRun({ outcome: 'FAIL', failedChecks: ['notExpired', 'signatureValid'] }))).toBe('Technical');
  });
});

describe('LAYERS', () => {
  it('lists the five interoperability layers, legal marked out of scope', () => {
    expect(LAYERS.map(l => l.layer)).toEqual(['Technical', 'Syntactical', 'Semantic', 'Organizational', 'Legal']);
    expect(LAYERS.at(-1)!.description).toMatch(/Out of scope/);
    expect(shortLayer('Semantic')).toBe('SEM');
    expect(shortLayer('Unclassified')).toBe('?');
  });
});
