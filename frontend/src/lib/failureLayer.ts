import { RunRecord } from '../types';

/**
 * Interoperability layers (NIFO / ETSI, as summarised by Schumm, Müller &
 * Stiller 2025). Each failing run is tagged with the lowest layer at which
 * it broke, so the report shows *where* ecosystems fail to interoperate.
 */
export type FailureLayer = 'Technical' | 'Syntactical' | 'Semantic' | 'Organizational' | 'Unclassified';

export const LAYERS: { layer: FailureLayer | 'Legal'; short: string; description: string }[] = [
  { layer: 'Technical', short: 'TECH', description: 'Transport errors, unreachable services, cryptographic signature or holder-binding (nonce) failures, tampering not detected.' },
  { layer: 'Syntactical', short: 'SYN', description: 'Credential or presentation not in the expected format (format check failed).' },
  { layer: 'Semantic', short: 'SEM', description: 'Data does not match the expected schema or meaning (schema check failed).' },
  { layer: 'Organizational', short: 'ORG', description: 'Policy and trust decisions such as validity periods (expiry check failed).' },
  { layer: 'Legal', short: 'LEGAL', description: 'Regulatory compatibility. Out of scope for automated runs.' }
];

export const shortLayer = (layer: FailureLayer) => LAYERS.find(l => l.layer === layer)?.short ?? '?';

/** The layer a failing run broke at; null for passing runs. */
export const failureLayer = (run: Pick<RunRecord, 'outcome' | 'tampered' | 'verificationStatus' | 'failedChecks' | 'errorDetail'>): FailureLayer | null => {
  if (run.outcome === 'PASS') return null;
  if (/^(Issuance|Verification) failed:/.test(run.errorDetail ?? '')) return 'Technical';
  // A tampered credential the verifier accepted: the integrity check did not work.
  if (run.tampered && run.verificationStatus === 'VALID') return 'Technical';
  const failed = run.failedChecks ?? [];
  if (failed.includes('signatureValid') || failed.includes('holderBinding')) return 'Technical';
  if (failed.includes('formatCheck')) return 'Syntactical';
  if (failed.includes('schemaCompliant')) return 'Semantic';
  if (failed.includes('notExpired')) return 'Organizational';
  return 'Unclassified';
};
