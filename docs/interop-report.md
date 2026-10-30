# Interoperability Report

Generated 2026-10-30T06:16:57.907Z by `backend/scripts/interop-report.ts` against a live BFF and the MOSIP Collab sandbox. Regenerate with `npm run report:interop` (see [testing.md](./testing.md)).

- **Collab component builds:** `Verify v2·ui 8b11a4ad | Certify 1.0·6777054c | Mimoto 27c84ecf`
- **Real Inji Certify issuance:** yes (Collab test identity configured)
- **Clean runs passed:** 26 / 30. With no emulated step: 18 / 22; where the mock engine stood in for a Collab service: 8 / 8.
- **Attacks correctly rejected:** 18 / 24

PASS means the verifier behaved as it should: it accepted a clean credential, or rejected an attacked one. Expected FAILs, explained in [known-issues.md](./known-issues.md):

- A real Inji Certify credential at the mock verifier: it carries no holder binding, so a strict verifier rejects it (G-12).
- Inji Verify accepting "wrong type" and "replay": its `/vc-verification` checks a credential, not a presentation (G-8).
- A Walt.id-issued credential at Inji Verify: Inji needs an x5c certificate chain and cannot resolve a did:key issuer (G-14).
- Walt.id accepting "wrong type" and "replay": its verifier checks signature and validity only, and cannot parse a key-binding JWT (G-15).

## Clean runs (every supported combination)

| Issuer | Wallet | Verifier | Format | Proof type | Verifier status | Outcome | Layer | Live steps | Emulated | Error detail |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Inji Certify (real) | Inji Web / Mobile | Inji Verify | W3C VC (JSON-LD) | Ed25519Signature2020 | VALID | PASS | — | 8 | no | — |
| Inji Certify | Inji Web / Mobile | Inji Verify | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 3 | yes | — |
| Inji Certify (real) | Inji Web / Mobile | Mock OpenID4VP | W3C VC (JSON-LD) | Ed25519Signature2020 | INVALID | FAIL | Technical | 7 | no | The credential is not bound to a holder (no credentialSubject.id), so possession cannot be proved. |
| Inji Certify | Inji Web / Mobile | Mock OpenID4VP | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 2 | yes | — |
| Inji Certify | Inji Web / Mobile | Mock OpenID4VP | mDoc (ISO 18013-5) | COSE_Sign1 (ES256) | VALID | PASS | — | 2 | yes | — |
| Inji Certify | Inji Web / Mobile | Walt.id Verifier | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 6 | yes | — |
| Inji Certify (real) | Simulated Holder | Inji Verify | W3C VC (JSON-LD) | Ed25519Signature2020 | VALID | PASS | — | 8 | no | — |
| Inji Certify | Simulated Holder | Inji Verify | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 2 | yes | — |
| Inji Certify (real) | Simulated Holder | Mock OpenID4VP | W3C VC (JSON-LD) | Ed25519Signature2020 | INVALID | FAIL | Technical | 7 | no | The credential is not bound to a holder (no credentialSubject.id), so possession cannot be proved. |
| Inji Certify | Simulated Holder | Mock OpenID4VP | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 1 | yes | — |
| Inji Certify | Simulated Holder | Mock OpenID4VP | mDoc (ISO 18013-5) | COSE_Sign1 (ES256) | VALID | PASS | — | 1 | yes | — |
| Inji Certify | Simulated Holder | Walt.id Verifier | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 5 | yes | — |
| Mock OpenID4VCI | Inji Web / Mobile | Inji Verify | W3C VC (JSON-LD) | Ed25519Signature2020 | VALID | PASS | — | 1 | no | — |
| Mock OpenID4VCI | Inji Web / Mobile | Inji Verify | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 1 | no | — |
| Mock OpenID4VCI | Inji Web / Mobile | Mock OpenID4VP | W3C VC (JSON-LD) | Ed25519Signature2020 | VALID | PASS | — | 0 | no | — |
| Mock OpenID4VCI | Inji Web / Mobile | Mock OpenID4VP | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 0 | no | — |
| Mock OpenID4VCI | Inji Web / Mobile | Mock OpenID4VP | mDoc (ISO 18013-5) | COSE_Sign1 (ES256) | VALID | PASS | — | 0 | no | — |
| Mock OpenID4VCI | Inji Web / Mobile | Walt.id Verifier | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 4 | no | — |
| Mock OpenID4VCI | Simulated Holder | Inji Verify | W3C VC (JSON-LD) | Ed25519Signature2020 | VALID | PASS | — | 1 | no | — |
| Mock OpenID4VCI | Simulated Holder | Inji Verify | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 1 | no | — |
| Mock OpenID4VCI | Simulated Holder | Mock OpenID4VP | W3C VC (JSON-LD) | Ed25519Signature2020 | VALID | PASS | — | 0 | no | — |
| Mock OpenID4VCI | Simulated Holder | Mock OpenID4VP | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 0 | no | — |
| Mock OpenID4VCI | Simulated Holder | Mock OpenID4VP | mDoc (ISO 18013-5) | COSE_Sign1 (ES256) | VALID | PASS | — | 0 | no | — |
| Mock OpenID4VCI | Simulated Holder | Walt.id Verifier | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 4 | no | — |
| Walt.id Issuer (real) | Inji Web / Mobile | Inji Verify | SD-JWT VC | JWT (EdDSA) | SIGNATURE_MISMATCH | FAIL | Technical | 6 | no | Inji Verify: schema and signature invalid (ERR_SIGNATURE_VERIFICATION_FAILED: Exception during Verification: getX509CertChain(...) must not be null); expiry not checked; 0 status check(s). |
| Walt.id Issuer (real) | Inji Web / Mobile | Mock OpenID4VP | SD-JWT VC | JWT (EdDSA) | VALID | PASS | — | 5 | no | — |
| Walt.id Issuer (real) | Inji Web / Mobile | Walt.id Verifier | SD-JWT VC | JWT (EdDSA) | VALID | PASS | — | 9 | no | — |
| Walt.id Issuer (real) | Simulated Holder | Inji Verify | SD-JWT VC | JWT (EdDSA) | SIGNATURE_MISMATCH | FAIL | Technical | 6 | no | Inji Verify: schema and signature invalid (ERR_SIGNATURE_VERIFICATION_FAILED: Exception during Verification: getX509CertChain(...) must not be null); expiry not checked; 0 status check(s). |
| Walt.id Issuer (real) | Simulated Holder | Mock OpenID4VP | SD-JWT VC | JWT (EdDSA) | VALID | PASS | — | 5 | no | — |
| Walt.id Issuer (real) | Simulated Holder | Walt.id Verifier | SD-JWT VC | JWT (EdDSA) | VALID | PASS | — | 9 | no | — |

Inji Verify × mDoc is not run: Inji Verify's service accepts no mDoc (G-10).

## Attacks (Mock OpenID4VCI → Simulated Holder)

| Verifier | Format | Attack | Verifier status | Failed checks | Outcome | Detail |
| --- | --- | --- | --- | --- | --- | --- |
| Inji Verify | W3C VC (JSON-LD) | Expired credential | EXPIRED | notExpired | PASS | — |
| Inji Verify | W3C VC (JSON-LD) | Corrupted signature | SIGNATURE_MISMATCH | signatureValid | PASS | — |
| Inji Verify | W3C VC (JSON-LD) | Wrong credential type | VALID |  | FAIL | Inji Verify: schema and signature valid; expiry valid; 0 status check(s). |
| Inji Verify | W3C VC (JSON-LD) | Replayed presentation | VALID |  | FAIL | Inji Verify: schema and signature valid; expiry valid; 0 status check(s). |
| Inji Verify | SD-JWT VC | Expired credential | EXPIRED | notExpired | PASS | — |
| Inji Verify | SD-JWT VC | Corrupted signature | SIGNATURE_MISMATCH | signatureValid | PASS | — |
| Inji Verify | SD-JWT VC | Wrong credential type | VALID |  | FAIL | Inji Verify: schema and signature valid; expiry valid; 0 status check(s). |
| Inji Verify | SD-JWT VC | Replayed presentation | VALID |  | FAIL | Inji Verify: schema and signature valid; expiry valid; 0 status check(s). |
| Mock OpenID4VP | W3C VC (JSON-LD) | Expired credential | EXPIRED | notExpired | PASS | — |
| Mock OpenID4VP | W3C VC (JSON-LD) | Corrupted signature | SIGNATURE_MISMATCH | signatureValid | PASS | — |
| Mock OpenID4VP | W3C VC (JSON-LD) | Wrong credential type | INVALID | schemaCompliant | PASS | — |
| Mock OpenID4VP | W3C VC (JSON-LD) | Replayed presentation | INVALID | holderBinding | PASS | — |
| Mock OpenID4VP | SD-JWT VC | Expired credential | EXPIRED | notExpired | PASS | — |
| Mock OpenID4VP | SD-JWT VC | Corrupted signature | SIGNATURE_MISMATCH | signatureValid | PASS | — |
| Mock OpenID4VP | SD-JWT VC | Wrong credential type | INVALID | schemaCompliant | PASS | — |
| Mock OpenID4VP | SD-JWT VC | Replayed presentation | INVALID | holderBinding | PASS | — |
| Mock OpenID4VP | mDoc (ISO 18013-5) | Expired credential | EXPIRED | notExpired | PASS | — |
| Mock OpenID4VP | mDoc (ISO 18013-5) | Corrupted signature | SIGNATURE_MISMATCH | signatureValid | PASS | — |
| Mock OpenID4VP | mDoc (ISO 18013-5) | Wrong credential type | INVALID | schemaCompliant | PASS | — |
| Mock OpenID4VP | mDoc (ISO 18013-5) | Replayed presentation | INVALID | holderBinding | PASS | — |
| Walt.id Verifier | SD-JWT VC | Expired credential | EXPIRED | notExpired | PASS | — |
| Walt.id Verifier | SD-JWT VC | Corrupted signature | SIGNATURE_MISMATCH | signatureValid | PASS | — |
| Walt.id Verifier | SD-JWT VC | Wrong credential type | VALID |  | FAIL | Walt.id verified the issuer signature and validity (signature, expired and not-before policies). It does not check a key-binding JWT, so there is no holder binding or replay protection. |
| Walt.id Verifier | SD-JWT VC | Replayed presentation | VALID |  | FAIL | Walt.id verified the issuer signature and validity (signature, expired and not-before policies). It does not check a key-binding JWT, so there is no holder binding or replay protection. |
