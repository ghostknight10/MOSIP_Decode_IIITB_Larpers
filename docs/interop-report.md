# Interoperability Report

Generated 2026-10-25T11:52:38.147Z by `backend/scripts/interop-report.ts` against a live BFF and the MOSIP Collab sandbox. Regenerate with `npm run report:interop` (see [testing.md](./testing.md)).

- **Collab component builds:** `Verify v2·ui 8b11a4ad | Certify 1.0·6777054c | Mimoto 27c84ecf`
- **Real Inji Certify issuance:** yes (Collab test identity configured)
- **Clean runs passed:** 18 / 20. With no emulated step: 12 / 14; where the mock engine stood in for a Collab service: 6 / 6.
- **Attacks correctly rejected:** 16 / 20

PASS means the verifier behaved as it should: it accepted a clean credential, or rejected an attacked one. Expected FAILs, explained in [known-issues.md](./known-issues.md):

- A real Inji Certify credential at the mock verifier: it carries no holder binding, so a strict verifier rejects it (G-12).
- Inji Verify accepting "wrong type" and "replay": its `/vc-verification` checks a credential, not a presentation (G-8).

## Clean runs (every supported combination)

| Issuer | Wallet | Verifier | Format | Proof type | Verifier status | Outcome | Layer | Live steps | Emulated | Error detail |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Inji Certify (real) | Inji Web / Mobile | Inji Verify | W3C VC (JSON-LD) | Ed25519Signature2020 | VALID | PASS | — | 8 | no | — |
| Inji Certify | Inji Web / Mobile | Inji Verify | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 3 | yes | — |
| Inji Certify (real) | Inji Web / Mobile | Mock OpenID4VP | W3C VC (JSON-LD) | Ed25519Signature2020 | INVALID | FAIL | Technical | 7 | no | The credential is not bound to a holder (no credentialSubject.id), so possession cannot be proved. |
| Inji Certify | Inji Web / Mobile | Mock OpenID4VP | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 2 | yes | — |
| Inji Certify | Inji Web / Mobile | Mock OpenID4VP | mDoc (ISO 18013-5) | COSE_Sign1 (ES256) | VALID | PASS | — | 2 | yes | — |
| Inji Certify (real) | Simulated Holder | Inji Verify | W3C VC (JSON-LD) | Ed25519Signature2020 | VALID | PASS | — | 8 | no | — |
| Inji Certify | Simulated Holder | Inji Verify | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 2 | yes | — |
| Inji Certify (real) | Simulated Holder | Mock OpenID4VP | W3C VC (JSON-LD) | Ed25519Signature2020 | INVALID | FAIL | Technical | 7 | no | The credential is not bound to a holder (no credentialSubject.id), so possession cannot be proved. |
| Inji Certify | Simulated Holder | Mock OpenID4VP | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 1 | yes | — |
| Inji Certify | Simulated Holder | Mock OpenID4VP | mDoc (ISO 18013-5) | COSE_Sign1 (ES256) | VALID | PASS | — | 1 | yes | — |
| Mock OpenID4VCI | Inji Web / Mobile | Inji Verify | W3C VC (JSON-LD) | Ed25519Signature2020 | VALID | PASS | — | 1 | no | — |
| Mock OpenID4VCI | Inji Web / Mobile | Inji Verify | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 1 | no | — |
| Mock OpenID4VCI | Inji Web / Mobile | Mock OpenID4VP | W3C VC (JSON-LD) | Ed25519Signature2020 | VALID | PASS | — | 0 | no | — |
| Mock OpenID4VCI | Inji Web / Mobile | Mock OpenID4VP | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 0 | no | — |
| Mock OpenID4VCI | Inji Web / Mobile | Mock OpenID4VP | mDoc (ISO 18013-5) | COSE_Sign1 (ES256) | VALID | PASS | — | 0 | no | — |
| Mock OpenID4VCI | Simulated Holder | Inji Verify | W3C VC (JSON-LD) | Ed25519Signature2020 | VALID | PASS | — | 1 | no | — |
| Mock OpenID4VCI | Simulated Holder | Inji Verify | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 1 | no | — |
| Mock OpenID4VCI | Simulated Holder | Mock OpenID4VP | W3C VC (JSON-LD) | Ed25519Signature2020 | VALID | PASS | — | 0 | no | — |
| Mock OpenID4VCI | Simulated Holder | Mock OpenID4VP | SD-JWT VC | JWT (ES256) | VALID | PASS | — | 0 | no | — |
| Mock OpenID4VCI | Simulated Holder | Mock OpenID4VP | mDoc (ISO 18013-5) | COSE_Sign1 (ES256) | VALID | PASS | — | 0 | no | — |

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
