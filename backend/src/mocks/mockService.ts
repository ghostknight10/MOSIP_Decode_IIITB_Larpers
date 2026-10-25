import { createHash } from 'node:crypto';
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
    proofType: string;
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
      email: subjectData.email || 'aaditya.sharma@example.org'
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
      const disclosures = Object.entries(baseSubject)
        .filter(([claim]) => claim !== 'id')
        .map(([claim, value]) => Buffer.from(JSON.stringify([uuidv4(), claim, value])).toString('base64url'));
      const digests = disclosures.map(disclosure =>
        createHash('sha256').update(disclosure).digest('base64url')
      );
      const fakeHeader = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'vc+sd-jwt' })).toString('base64url');
      const fakePayload = Buffer.from(
        JSON.stringify({
          iss: 'https://issuer.mock.mosip.net',
          sub: baseSubject.id,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
          vct: 'https://schema.mosip.net/credentials/national-id/v1',
          _sd_alg: 'sha-256',
          _sd: digests
        })
      ).toString('base64url');
      const fakeSig = Buffer.from('mock_crypto_signature_es256_valid').toString('base64url');
      issuedCredential = {
        format: 'vc+sd-jwt',
        rawToken: `${fakeHeader}.${fakePayload}.${fakeSig}~${disclosures.join('~')}~`,
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
      proofType: format === 'sd-jwt' ? 'JWT (ES256)' : issuedCredential.proof.type,
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
    client_id: string;
    nonce: string;
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
    const clientId = 'https://verify.mock.mosip.net';
    const nonce = uuidv4();

    // Check tampering simulation
    let isExpired = false;
    let signatureMismatch = false;
    const wrongCredentialType = Boolean(tamperPayload?.wrongCredentialType);

    if (tamperPayload) {
      if (tamperPayload.forceExpired) isExpired = true;
      if (tamperPayload.corruptSignature) signatureMismatch = true;
    }

    const isValid = !isExpired && !signatureMismatch && !wrongCredentialType;
    let statusText: 'VALID' | 'INVALID' | 'EXPIRED' | 'SIGNATURE_MISMATCH' = 'VALID';
    let details = 'All cryptographic signatures, schemas, and trust anchors verified successfully against MOSIP root.';

    if (isExpired) {
      statusText = 'EXPIRED';
      details = 'Credential expiration check failed: validity period exceeded.';
    } else if (signatureMismatch) {
      statusText = 'SIGNATURE_MISMATCH';
      details = 'Cryptographic verification failed: Proof signature does not match issuer public key.';
    } else if (wrongCredentialType) {
      statusText = 'INVALID';
      details = 'Credential type check failed: the presented credential is not a National Identity credential.';
    }

    const sampleClaims = {
      fullName: 'Aaditya Sharma',
      nationalId: 'MOSIP-IND-9876-5432-1098',
      country: 'IND'
    };
    let presentedClaims: Record<string, unknown> | undefined;
    if (format === 'sd-jwt' && typeof presentedTokenOrVC?.rawToken === 'string') {
      presentedClaims = {};
      for (const encoded of presentedTokenOrVC.rawToken.split('~').slice(1).filter(Boolean)) {
        const disclosure = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
        if (Array.isArray(disclosure) && disclosure.length === 3 && typeof disclosure[1] === 'string') {
          presentedClaims[disclosure[1]] = disclosure[2];
        }
      }
    } else {
      presentedClaims = presentedTokenOrVC?.credentialSubject ??
        presentedTokenOrVC?.decoded?.payload?.claims ??
        sampleClaims;
    }
    const requestedClaimNames = presentationDefinition.input_descriptors[0].constraints.fields
      .map((field: { path: string[] }) => field.path[0].split('.').pop());
    const verifiedClaims = Object.fromEntries(
      requestedClaimNames
        .filter((claim): claim is string => typeof claim === 'string' && claim in (presentedClaims ?? {}))
        .map(claim => [claim, presentedClaims![claim]])
    );
    const verificationResult = {
      status: statusText,
      checks: {
        formatCheck: !wrongCredentialType,
        signatureValid: !signatureMismatch,
        notExpired: !isExpired,
        schemaCompliant: true
      },
      details,
      verifiedClaims
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
        url: `openid4vp://authorize?${new URLSearchParams({
          client_id: clientId,
          nonce,
          response_type: 'vp_token'
        }).toString()}`
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
      tampered: Boolean(
        tamperPayload?.forceExpired ||
        tamperPayload?.corruptSignature ||
        tamperPayload?.wrongCredentialType
      )
    };

    return {
      isValid,
      verificationResult,
      presentationDefinition,
      client_id: clientId,
      nonce,
      logs: [vpLog1, vpLog2]
    };
  }
}
