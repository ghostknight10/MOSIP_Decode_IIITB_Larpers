import { ProtocolLog } from '../types';

export type Participant = 'Issuer' | 'Wallet' | 'Verifier';

/**
 * Maps the free-text sender/receiver names in protocol logs to a role.
 * Covers MOSIP product names ("Inji Certify", "Inji Verify (Collab Sandbox
 * Emulated)") as well as generic ones ("Verifier (OpenID4VP)").
 */
export const participantOf = (name: string): Participant | null => {
  const n = name.toLowerCase();
  if (/verif/.test(n)) return 'Verifier';
  if (/issu|certify/.test(n)) return 'Issuer';
  if (/wallet|holder|mimoto/.test(n)) return 'Wallet';
  return null;
};

/** Logs are stored newest-first; most views want them in protocol order. */
export const chronological = (logs: ProtocolLog[]) => [...logs].reverse();
