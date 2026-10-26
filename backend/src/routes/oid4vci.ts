import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { MockProtocolService } from '../mocks/mockService.js';
import { CredentialFormat } from '../types/index.js';

export const oid4vciRouter = Router();

const getBaseUrl = (req: Request) => {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:4000';
  return `${proto}://${host}/api/oid4vci`;
};

/**
 * OpenID4VCI Metadata Discovery Endpoint
 * Compliant with OpenID for Verifiable Credential Issuance Draft 13
 */
oid4vciRouter.get(['/.well-known/openid-credential-issuer', '/metadata'], (req: Request, res: Response) => {
  const issuerUrl = getBaseUrl(req);
  res.json({
    credential_issuer: issuerUrl,
    credential_endpoint: `${issuerUrl}/credential`,
    token_endpoint: `${issuerUrl}/token`,
    nonce_endpoint: `${issuerUrl}/nonce`,
    display: [
      {
        name: 'MOSIP National Identity Issuer',
        locale: 'en',
        logo: {
          uri: 'https://raw.githubusercontent.com/mosip/inji-config/master/logos/veridonia-logo.png',
          alt_text: 'MOSIP National Identity'
        }
      }
    ],
    credential_configurations_supported: {
      NationalId_W3C_JSONLD: {
        format: 'ldp_vc',
        scope: 'NationalId',
        cryptographic_binding_methods_supported: ['did:key', 'did:jwk'],
        credential_signing_alg_values_supported: ['EdDSA', 'ES256'],
        proof_types_supported: {
          jwt: { proof_signing_alg_values_supported: ['ES256', 'EdDSA'] }
        },
        credential_definition: {
          type: ['VerifiableCredential', 'MosipNationalIdentityCredential'],
          '@context': [
            'https://www.w3.org/2018/credentials/v1',
            'https://inji.github.io/inji-config/contexts/mosip-identity-context.json'
          ]
        },
        display: [
          {
            name: 'MOSIP National Identity Card',
            locale: 'en',
            background_color: '#1e1b4b',
            text_color: '#ffffff'
          }
        ],
        claims: {
          fullName: { display: [{ name: 'Full Name', locale: 'en' }] },
          nationalId: { display: [{ name: 'National ID / UIN', locale: 'en' }] },
          dob: { display: [{ name: 'Date of Birth', locale: 'en' }] },
          country: { display: [{ name: 'Country', locale: 'en' }] }
        }
      },
      NationalId_SD_JWT: {
        format: 'vc+sd-jwt',
        vct: 'https://schema.mosip.net/credentials/national-id/v1',
        cryptographic_binding_methods_supported: ['did:key', 'did:jwk'],
        credential_signing_alg_values_supported: ['ES256'],
        proof_types_supported: {
          jwt: { proof_signing_alg_values_supported: ['ES256'] }
        },
        display: [
          {
            name: 'MOSIP National Identity (SD-JWT)',
            locale: 'en',
            background_color: '#1e1b4b',
            text_color: '#ffffff'
          }
        ]
      }
    }
  });
});

/**
 * OpenID4VCI Token Endpoint
 * Handles pre-authorized_code grant type without requiring external eSignet OAuth
 */
oid4vciRouter.post('/token', (req: Request, res: Response) => {
  res.json({
    access_token: `token-${uuidv4().substring(0, 12)}`,
    token_type: 'bearer',
    expires_in: 86400,
    c_nonce: `nonce-${uuidv4().substring(0, 8)}`,
    c_nonce_expires_in: 86400
  });
});

/**
 * OpenID4VCI Nonce Endpoint
 */
oid4vciRouter.post('/nonce', (_req: Request, res: Response) => {
  res.json({
    c_nonce: `nonce-${uuidv4().substring(0, 8)}`,
    c_nonce_expires_in: 86400
  });
});

/**
 * OpenID4VCI Credential Issuance Endpoint
 * Mints the signed credential for the citizen
 */
oid4vciRouter.post('/credential', async (req: Request, res: Response) => {
  try {
    const requestedFormat: CredentialFormat =
      req.body?.format === 'vc+sd-jwt' ? 'sd-jwt' : 'w3c-vc';

    const subject = {
      fullName: 'Aaditya Sharma',
      nationalId: 'MOSIP-IND-9876-5432-1098',
      dob: '1995-08-15',
      country: 'IND',
      email: 'aaditya.sharma@example.org'
    };

    const credential = await MockProtocolService.mintCredential(requestedFormat, subject);

    // Support both single credential object and array formats per OID4VCI drafts
    return res.json({
      credential,
      credentials: [{ credential }]
    });
  } catch (err: any) {
    return res.status(500).json({
      error: 'issuance_failed',
      error_description: err?.message || 'Failed to mint credential'
    });
  }
});
