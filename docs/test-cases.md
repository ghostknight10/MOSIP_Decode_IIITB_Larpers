# MOSIP VC Interoperability Playground — Verification & Test Cases

This document defines 5 automated and manual test scenarios to validate cross-ecosystem interoperability and protocol conformance for the submission.

---

### TC-01: Happy Path W3C VC Issuance & Verification
* **Objective:** Verify end-to-end issuance and verification of a standard W3C Linked Data Proof (JSON-LD) credential.
* **Nodes:**
  * Issuer: `Inji Certify` (or `Mock OpenID4VCI`)
  * Wallet: `Inji Web / Mobile` (or `Simulated Wallet`)
  * Verifier: `Inji Verify` (or `Mock OpenID4VP`)
  * Format: `W3C VC (JSON-LD)`
* **Steps:**
  1. Select nodes in the 3-Column Matrix.
  2. Click **Trigger "Issue Credential" Flow**.
  3. Confirm Credential Offer QR code and signed VC are generated.
  4. Click **Trigger "Present & Verify" Flow**.
* **Expected Result:**
  * Verifier status returns `VALID`.
  * Protocol Inspector logs 4 distinct transactions:
    1. `GET /.well-known/openid-credential-issuer`
    2. `POST /credential`
    3. `GET openid4vp://authorize`
    4. `POST /vp-response`

---

### TC-02: Happy Path SD-JWT VC Issuance & Verification
* **Objective:** Validate IETF Selective Disclosure JWT VC lifecycle with salted disclosures.
* **Nodes:**
  * Issuer: `Mock OpenID4VCI`
  * Wallet: `Inji Web / Mobile`
  * Verifier: `Mock OpenID4VP`
  * Format: `SD-JWT VC`
* **Steps:**
  1. Toggle format selector to `SD-JWT VC`.
  2. Trigger Issuance followed by Presentation & Verification.
* **Expected Result:**
  * Raw token envelope contains `vc+sd-jwt` formatting (`~` separated disclosures).
  * Verifier status returns `VALID`.

---

### TC-03: Negative Test — Expired Credential Presentation
* **Objective:** Ensure verifier correctly detects and rejects expired credentials.
* **Steps:**
  1. Enable **Tamper / Chaos Mode** in the workflow pipeline.
  2. Check **Expire Timestamp (Negative Path)**.
  3. Execute Issuance and Verification.
* **Expected Result:**
  * Verifier status returns `EXPIRED`.
  * Status badge highlights in red with detail `Credential expiration check failed: validity period exceeded`.

---

### TC-04: Negative Test — Corrupted Cryptographic Signature
* **Objective:** Validate cryptographic integrity check when the proof signature has been modified.
* **Steps:**
  1. Enable **Tamper / Chaos Mode**.
  2. Check **Corrupt Cryptographic Signature**.
  3. Execute Presentation & Verification.
* **Expected Result:**
  * Verifier returns `SIGNATURE_MISMATCH`.
  * Dynamic sequence diagram annotates the step with a warning: `⚠️ Tampered Payload Detected!`.

---

### TC-05: Cross-Ecosystem Boundary Test (Mock to Inji & Inji to Mock)
* **Objective:** Confirm full interoperability across heterogeneous software implementations.
* **Combinations:**
  * Combination A: `Mock OpenID4VCI` &rarr; `Inji Web` &rarr; `Inji Verify`
  * Combination B: `Inji Certify` &rarr; `Simulated Wallet` &rarr; `Mock OpenID4VP`
* **Expected Result:**
  * Both combinations execute without schema or format rejection.
  * Interop Matrix view marks all 8 combinations with 100% `PASS`.
