import { nodeLabel } from '../config/nodes';
import { IssuerType, VerifierType } from '../types';

/**
 * Plain-language notice naming which MOSIP modules were emulated in this run,
 * or null when everything was served by the real target.
 */
export const fallbackNotice = (
  selection: { issuer: IssuerType; verifier: VerifierType },
  issueFallback: boolean,
  verifyFallback: boolean
): string | null => {
  const nodes = [issueFallback && nodeLabel(selection.issuer), verifyFallback && nodeLabel(selection.verifier)].filter(Boolean);
  if (!nodes.length) return null;
  return `MOSIP Collab sandbox unreachable: ${nodes.join(' and ')} responses are emulated by the mock engine.`;
};
