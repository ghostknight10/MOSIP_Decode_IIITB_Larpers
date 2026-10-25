import { TamperOptions } from '../types';
import { Selection } from '../hooks/usePlaygroundRun';

/**
 * One-click presets that mirror the documented test cases (docs/test-cases.md),
 * so a demo or a newcomer doesn't have to know which nodes to combine.
 */
export interface Scenario {
  id: string;
  testCase: string;
  label: string;
  description: string;
  selection: Selection;
  /** null = clean run; otherwise the attack applied at presentation. */
  tamper: TamperOptions | null;
}

const ALL_INJI: Selection = { issuer: 'inji-certify', wallet: 'inji-wallet', verifier: 'inji-verify', format: 'w3c-vc' };

export const SCENARIOS: Scenario[] = [
  {
    id: 'happy-w3c',
    testCase: 'TC-01',
    label: 'Happy path · W3C VC',
    description: 'All-Inji issue, hold, present and verify with a JSON-LD credential.',
    selection: ALL_INJI,
    tamper: null
  },
  {
    id: 'happy-sdjwt',
    testCase: 'TC-02',
    label: 'Happy path · SD-JWT',
    description: 'Mock issuer to Inji wallet to mock verifier with selective disclosure.',
    selection: { issuer: 'mock-openid4vci', wallet: 'inji-wallet', verifier: 'mock-openid4vp', format: 'sd-jwt' },
    tamper: null
  },
  {
    id: 'expired',
    testCase: 'TC-03',
    label: 'Expired credential',
    description: 'Present an expired credential; the verifier should reject it.',
    selection: ALL_INJI,
    tamper: { forceExpired: true, corruptSignature: false }
  },
  {
    id: 'bad-signature',
    testCase: 'TC-04',
    label: 'Corrupted signature',
    description: 'Tamper with the proof; the verifier should report a signature mismatch.',
    selection: ALL_INJI,
    tamper: { forceExpired: false, corruptSignature: true }
  },
  {
    id: 'cross-mock-to-inji',
    testCase: 'TC-05a',
    label: 'Mock issuer → Inji Verify',
    description: 'Cross-ecosystem: a non-MOSIP issuer verified by Inji Verify.',
    selection: { issuer: 'mock-openid4vci', wallet: 'inji-wallet', verifier: 'inji-verify', format: 'w3c-vc' },
    tamper: null
  },
  {
    id: 'cross-inji-to-mock',
    testCase: 'TC-05b',
    label: 'Inji Certify → mock verifier',
    description: 'Cross-ecosystem: an Inji credential verified by a non-MOSIP verifier.',
    selection: { issuer: 'inji-certify', wallet: 'mock-wallet', verifier: 'mock-openid4vp', format: 'sd-jwt' },
    tamper: null
  },
  {
    id: 'mdoc',
    testCase: 'TC-07',
    label: 'mDoc (ISO 18013-5)',
    description: 'Inji wallet holds an mDoc and discloses two elements to the mock verifier.',
    selection: { issuer: 'mock-openid4vci', wallet: 'inji-wallet', verifier: 'mock-openid4vp', format: 'mso-mdoc' },
    tamper: null
  },
  {
    id: 'replay',
    testCase: 'TC-08',
    label: 'Replayed presentation',
    description: 'The wallet resends a presentation made for an earlier request; the verifier should reject it.',
    selection: { issuer: 'mock-openid4vci', wallet: 'mock-wallet', verifier: 'mock-openid4vp', format: 'sd-jwt' },
    tamper: { forceExpired: false, corruptSignature: false, replayPresentation: true }
  }
];
