import { nodeLabel } from '../config/nodes';
import { IssuerType, VerifierType } from '../types';

/**
 * Plain-language notice naming which MOSIP modules were emulated in this run,
 * or null when everything was served by the real target. The BFF's own notices
 * say why (sandbox unreachable, or a step that needs a user login).
 */
export const fallbackNotice = (
  selection: { issuer: IssuerType; verifier: VerifierType },
  issueFallback: boolean,
  verifyFallback: boolean
): string | null => {
  const nodes = [issueFallback && nodeLabel(selection.issuer), verifyFallback && nodeLabel(selection.verifier)].filter(Boolean);
  if (!nodes.length) return null;
  return `Emulated in this run: ${nodes.join(' and ')} responses come from the mock engine.`;
};
