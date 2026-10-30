import { CredentialFormat, CredentialSubjectInput, IssuerType, NodeRole, VerifierType, WalletType } from '../types';

/**
 * Registry of every implementation that can play a role in the matrix.
 * The selector, the report and "run all combinations" are all derived from
 * this list, so adding a node (e.g. an mDoc issuer or an external Walt.id
 * verifier) is a single entry here plus backend support.
 */

export interface NodeDescriptor<Id extends string = string> {
  id: Id;
  role: NodeRole;
  label: string;
  shortLabel: string;
  badge: string;
  description: string;
  /** Official MOSIP module reached through the Collab sandbox (may be emulated). */
  isMosip: boolean;
  supportedFormats: CredentialFormat[];
  /** OpenID4VP client_id used when rendering the authorization request QR. */
  clientId?: string;
}

export const ISSUERS: NodeDescriptor<IssuerType>[] = [
  {
    id: 'inji-certify',
    role: 'issuer',
    label: 'Inji Certify',
    shortLabel: 'Inji Certify',
    badge: 'MOSIP Collab',
    description: 'Official MOSIP issuance module supporting pre-authorized credential offers.',
    isMosip: true,
    supportedFormats: ['w3c-vc', 'sd-jwt', 'mso-mdoc']
  },
  {
    id: 'mock-openid4vci',
    role: 'issuer',
    label: 'Mock OpenID4VCI',
    shortLabel: 'Mock OID4VCI',
    badge: 'Custom Spec',
    description: 'Self-hosted OID4VCI (Draft 13) mock for simulating edge cases and negative signatures.',
    isMosip: false,
    supportedFormats: ['w3c-vc', 'sd-jwt', 'mso-mdoc']
  },
  {
    id: 'walt-issuer',
    role: 'issuer',
    label: 'Walt.id Issuer',
    shortLabel: 'Walt.id Issuer',
    badge: 'External',
    description: 'Independent, non-MOSIP OpenID4VCI (Draft 13) issuer: Walt.id\'s public demo, issuing SD-JWT VC over a pre-authorized code.',
    isMosip: false,
    supportedFormats: ['sd-jwt']
  }
];

export const WALLETS: NodeDescriptor<WalletType>[] = [
  {
    id: 'inji-wallet',
    role: 'wallet',
    label: 'Inji Web / Mobile',
    shortLabel: 'Inji Wallet',
    badge: 'MOSIP Mimoto',
    description: 'MOSIP Inji reference wallet (mobile via QR / deep-link, or Inji Web) backed by Mimoto.',
    isMosip: true,
    supportedFormats: ['w3c-vc', 'sd-jwt', 'mso-mdoc']
  },
  {
    id: 'mock-wallet',
    role: 'wallet',
    label: 'Simulated Holder',
    shortLabel: 'Simulated Holder',
    badge: 'Headless',
    description: 'Headless software wallet running in the playground for automated assertions.',
    isMosip: false,
    supportedFormats: ['w3c-vc', 'sd-jwt', 'mso-mdoc']
  }
];

export const VERIFIERS: NodeDescriptor<VerifierType>[] = [
  {
    id: 'inji-verify',
    role: 'verifier',
    label: 'Inji Verify',
    shortLabel: 'Inji Verify',
    badge: 'MOSIP Collab',
    description: 'MOSIP Inji Verify checking signatures, issuer DIDs, expiry and schema.',
    isMosip: true,
    supportedFormats: ['w3c-vc', 'sd-jwt'],
    clientId: 'https://injiverify.collab.mosip.net'
  },
  {
    id: 'mock-openid4vp',
    role: 'verifier',
    label: 'Mock OpenID4VP',
    shortLabel: 'Mock OID4VP',
    badge: 'Custom Spec',
    description: 'Self-hosted OID4VP (Draft 21) verifier evaluating presentation definitions.',
    isMosip: false,
    supportedFormats: ['w3c-vc', 'sd-jwt', 'mso-mdoc'],
    clientId: 'https://verify.mock.mosip.net'
  },
  {
    id: 'walt-verifier',
    role: 'verifier',
    label: 'Walt.id Verifier',
    shortLabel: 'Walt.id Verifier',
    badge: 'External',
    description: 'Independent, non-MOSIP OpenID4VP verifier: Walt.id\'s public demo, checking SD-JWT VC signature and validity. No key binding, so no replay protection.',
    isMosip: false,
    supportedFormats: ['sd-jwt'],
    clientId: 'https://verifier.demo.walt.id/openid4vc/verify'
  }
];

export const FORMATS: { id: CredentialFormat; label: string; wireFormat: string }[] = [
  { id: 'w3c-vc', label: 'W3C VC (JSON-LD)', wireFormat: 'ldp_vc' },
  { id: 'sd-jwt', label: 'SD-JWT VC', wireFormat: 'vc+sd-jwt' },
  { id: 'mso-mdoc', label: 'mDoc (ISO 18013-5)', wireFormat: 'mso_mdoc' }
];

const ALL_NODES: NodeDescriptor[] = [...ISSUERS, ...WALLETS, ...VERIFIERS];

export const getNode = (id: string) => ALL_NODES.find(n => n.id === id);
export const nodeLabel = (id: string) => getNode(id)?.label ?? id;
export const formatLabel = (id: CredentialFormat) => FORMATS.find(f => f.id === id)?.label ?? id;

export const DEFAULT_SUBJECT: CredentialSubjectInput = {
  fullName: 'Aaditya Sharma',
  dob: '1995-08-15',
  nationalId: 'MOSIP-IND-9876-5432-1098',
  email: 'aaditya.sharma@example.org',
  country: 'IND'
};

/** Every issuer × wallet × verifier × format combination, for the report and batch runs. */
export const allCombinations = () =>
  ISSUERS.flatMap(issuer =>
    WALLETS.flatMap(wallet =>
      VERIFIERS.flatMap(verifier =>
        FORMATS.filter(f =>
          [issuer, wallet, verifier].every(n => n.supportedFormats.includes(f.id))
        ).map(f => ({ issuer: issuer.id, wallet: wallet.id, verifier: verifier.id, format: f.id }))
      )
    )
  );

export const comboKey = (c: { issuer: string; wallet: string; verifier: string; format: string }) =>
  `${c.issuer}|${c.wallet}|${c.verifier}|${c.format}`;
