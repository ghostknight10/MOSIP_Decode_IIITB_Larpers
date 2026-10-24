import { v4 as uuidv4 } from 'uuid';
import { CredentialFormat, ProtocolLog } from '../types/index.js';

export class MockProtocolService {
  /**
   * Generates a realistic OpenID4VCI Draft 13 Credential Offer & Issued VC
   */
  public static issueCredential(
    format: CredentialFormat,
    subjectData: any = {},
    tamperPayload?: Record<string, any>
  ): {
    credentialOffer: any;
    issuedCredential: any;
    logs: ProtocolLog[];
  } {
    const offerId = `urn:uuid:${uuidv4()}`;
    const txId = uuidv4();
    const startTime = Date.now();

    const baseSubject = {
      id: `did:key:z6MkuTq...mockHolderDid`,
      nationalId: subjectData.nationalId || 'MOSIP-IND-9876-5432-1098',
      fullName: subjectData.fullName || 'Aaditya Sharma',
      dob: subjectData.dob || '1995-08-15',
      country: subjectData.country || 'IND',
      email: subjectData.email || 'aaditya.sharma@example.org',
      ...(tamperPayload || {})
    };

    // OpenID4VCI Draft 13 Credential Offer format
    const credentialOffer = {
      credential_issuer: 'https://issuer.mock.mosip.net',
      credential_configuration_ids: [
        format === 'sd-jwt' ? 'NationalId_SD_JWT' : 'NationalId_W3C_JSONLD'
      ],
      grants: {
        'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
          'pre-authorized_code': `authz-code-${uuidv4().substring(0, 8)}`,
          user_pin_required: false
        }
      }
    };

    let issuedCredential: any;

    if (format === 'sd-jwt') {
      // SD-JWT VC representation (Header.Payload~Disclosure1~Disclosure2.Signature)
      const fakeHeader = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'vc+sd-jwt' })).toString('base64url');
      const fakePayload = Buffer.from(
        JSON.stringify({
          iss: 'https://issuer.mock.mosip.net',
          sub: baseSubject.id,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
          vct: 'https://schema.mosip.net/credentials/national-id/v1',
          _sd_alg: 'sha-256',
          _sd: [
            'W2E4dHJhX2Rpc2Nsb3N1cmVfMV0=',
            'W2E4dHJhX2Rpc2Nsb3N1cmVfMl0='
          ],
          ...baseSubject
        })
      ).toString('base64url');
      const fakeSig = Buffer.from('mock_crypto_signature_es256_valid').toString('base64url');
      issuedCredential = {
        format: 'vc+sd-jwt',
        rawToken: `${fakeHeader}.${fakePayload}.${fakeSig}~WyJzYWx0MSIsICJuYXRpb25hbElkIiwgIk1PU0lQLUlORC05ODc2LTU0MzItMTA5OCJd~`,
        decoded: {
          header: { alg: 'ES256', typ: 'vc+sd-jwt' },
          payload: {
            iss: 'https://issuer.mock.mosip.net',
            vct: 'https://schema.mosip.net/credentials/national-id/v1',
            claims: baseSubject
          }
        }
      };
    } else {
      // W3C VC JSON-LD representation
      issuedCredential = {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://schema.mosip.net/contexts/identity-v1.jsonld'
        ],
        id: offerId,
        type: ['VerifiableCredential', 'MosipNationalIdentityCredential'],
        issuer: {
          id: 'did:mosip:certify:sandbox:mock-issuer',
          name: 'MOSIP Collab Identity Authority'
        },
        issuanceDate: new Date().toISOString(),
        expirationDate: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
        credentialSubject: baseSubject,
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date().toISOString(),
          verificationMethod: 'did:mosip:certify:sandbox:mock-issuer#key-1',
          proofPurpose: 'assertionMethod',
          proofValue: 'z3hWb23...mockValidEd25519Proof...'
        }
      };
    }

    const log1: ProtocolLog = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      step: 1,
      sender: 'Wallet',
      receiver: 'Issuer (OpenID4VCI)',
      protocol: 'OpenID4VCI',
      action: 'Fetch Credential Offer',
      status: 'SUCCESS',
      request: {
        method: 'GET',
        url: 'https://issuer.mock.mosip.net/.well-known/openid-credential-issuer'
      },
      response: {
        status: 200,
        body: credentialOffer
      },
      durationMs: 42
    };

    const log2: ProtocolLog = {
      id: uuidv4(),
      timestamp: new Date(Date.now() + 50).toISOString(),
      step: 2,
      sender: 'Wallet',
      receiver: 'Issuer (OpenID4VCI)',
      protocol: 'OpenID4VCI',
      action: 'Credential Request (/credential)',
      status: 'SUCCESS',
      request: {
        method: 'POST',
        url: 'https://issuer.mock.mosip.net/credential',
        headers: { 'Content-Type': 'application/json' },
        body: {
          format: format === 'sd-jwt' ? 'vc+sd-jwt' : 'ldp_vc',
          proof: { proof_type: 'jwt', jwt: 'eyJhbGciOiJFUzI1NiIsIn...' }
        }
      },
      response: {
        status: 200,
        body: issuedCredential
      },
      durationMs: 78
    };

    return {
      credentialOffer,
      issuedCredential,
      logs: [log1, log2]
    };
  }

  /**
   * Evaluates OpenID4VP Draft 21 Presentation & verification
   */
  public static verifyPresentation(
    format: CredentialFormat,
    presentedTokenOrVC: any,
    tamperPayload?: Record<string, any>
  ): {
    isValid: boolean;
    verificationResult: {
      status: 'VALID' | 'INVALID' | 'EXPIRED' | 'SIGNATURE_MISMATCH';
      checks: {
        formatCheck: boolean;
        signatureValid: boolean;
        notExpired: boolean;
        schemaCompliant: boolean;
      };
      details: string;
      verifiedClaims: any;
    };
    presentationDefinition: any;
    logs: ProtocolLog[];
  } {
    // OpenID4VP Draft 21 Presentation Definition
    const presentationDefinition = {
      id: `pres-def-${uuidv4().substring(0, 8)}`,
      input_descriptors: [
        {
          id: 'national_id_credential',
          name: 'National Identity Proof',
          purpose: 'Verify age, identity, and citizenship without leaking unwanted attributes',
          format: {
            [format === 'sd-jwt' ? 'vc+sd-jwt' : 'ldp_vc']: {
              alg: ['ES256', 'EdDSA']
            }
          },
          constraints: {
            fields: [
              {
                path: ['$.credentialSubject.fullName', '$.fullName'],
                filter: { type: 'string' }
              },
              {
                path: ['$.credentialSubject.nationalId', '$.nationalId'],
                filter: { type: 'string' }
              }
            ]
          }
        }
      ]
    };

    // Check tampering simulation
    let isExpired = false;
    let signatureMismatch = false;

    if (tamperPayload) {
      if (tamperPayload.forceExpired) isExpired = true;
      if (tamperPayload.corruptSignature) signatureMismatch = true;
    }

    const isValid = !isExpired && !signatureMismatch;
    let statusText: 'VALID' | 'INVALID' | 'EXPIRED' | 'SIGNATURE_MISMATCH' = 'VALID';
    let details = 'All cryptographic signatures, schemas, and trust anchors verified successfully against MOSIP root.';

    if (isExpired) {
      statusText = 'EXPIRED';
      details = 'Credential expiration check failed: validity period exceeded.';
    } else if (signatureMismatch) {
      statusText = 'SIGNATURE_MISMATCH';
      details = 'Cryptographic verification failed: Proof signature does not match issuer public key.';
    }

    const verificationResult = {
      status: statusText,
      checks: {
        formatCheck: true,
        signatureValid: !signatureMismatch,
        notExpired: !isExpired,
        schemaCompliant: true
      },
      details,
      verifiedClaims: presentedTokenOrVC?.credentialSubject || presentedTokenOrVC?.decoded?.payload?.claims || {
        fullName: 'Aaditya Sharma',
        nationalId: 'MOSIP-IND-9876-5432-1098',
        country: 'IND'
      }
    };

    const vpLog1: ProtocolLog = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      step: 3,
      sender: 'Verifier (OpenID4VP)',
      receiver: 'Wallet',
      protocol: 'OpenID4VP',
      action: 'Authorization Request (Presentation Definition)',
      status: 'SUCCESS',
      request: {
        method: 'GET',
        url: 'openid4vp://authorize?client_id=https://verify.mock.mosip.net&response_type=vp_token'
      },
      response: {
        status: 200,
        body: presentationDefinition
      },
      durationMs: 35
    };

    const vpLog2: ProtocolLog = {
      id: uuidv4(),
      timestamp: new Date(Date.now() + 60).toISOString(),
      step: 4,
      sender: 'Wallet',
      receiver: 'Verifier (OpenID4VP)',
      protocol: 'OpenID4VP',
      action: 'VP Token Submission (/response)',
      status: isValid ? 'SUCCESS' : 'FAILED',
      request: {
        method: 'POST',
        url: 'https://verify.mock.mosip.net/vp-response',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: {
          vp_token: presentedTokenOrVC || 'mock_vp_token_payload'
        }
      },
      response: {
        status: isValid ? 200 : 400,
        body: verificationResult
      },
      durationMs: 110,
      tampered: Boolean(tamperPayload && Object.keys(tamperPayload).length > 0)
    };

    return {
      isValid,
      verificationResult,
      presentationDefinition,
      logs: [vpLog1, vpLog2]
    };
  }
}
