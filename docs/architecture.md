# MOSIP VC Interoperability Playground — Architecture & Protocol Specs

## Overview
The **MOSIP Verifiable Credential (VC) Interoperability Playground** is an interactive, developer-first testing workbench engineered to validate cross-ecosystem interoperability across standard digital identity protocols and credential formats.

### Core Objectives
1. **Multi-Party Matrix Execution**: Select and execute combinations of standard Issuers, Wallets, and Verifiers.
2. **Dual Credential Standards**: Test **W3C VC (JSON-LD)** and **IETF SD-JWT VC (Selective Disclosure)**.
3. **Protocol Transparency**: Intercept and inspect real-time HTTP wire payloads for **OpenID4VCI (Draft 13)** and **OpenID4VP (Draft 21)**.
4. **Negative Path / Tamper Simulation**: Evaluate cryptographically signed proof resilience against expired timestamps and signature tampering.

---

## System Component Topology

```
+-----------------------------------------------------------------------------------+
|                                Browser Client (UI)                                |
|   - 3-Column Matrix Selector (Amogh)    - Mermaid.js Dynamic Visualizer (Ayaan)   |
|   - Flow Execution Controls (Amogh)     - Live Protocol Inspector (Ayaan)         |
+-----------------------------------------------------------------------------------+
                                        |  HTTP / REST (/api/playground)
                                        v
+-----------------------------------------------------------------------------------+
|                        Node.js / Express BFF Orchestrator                         |
|   - In-Memory Protocol Audit Logger (Aatraya)                                     |
|   - Mock Standards Protocol Engine (Aryan)                                        |
|   - Proxy Gateway to MOSIP Collab Sandbox (Aatraya)                               |
+-----------------------------------------------------------------------------------+
                  |                                           |
                  | OpenID4VCI / OpenID4VP                    | OpenID4VCI / OpenID4VP
                  v                                           v
+-----------------------------------+       +---------------------------------------+
|       MOSIP Collab Sandbox        |       |        Standards Mock Engine          |
|  - Inji Certify (Issuance)        |       |  - OpenID4VCI Draft-13 Issuer         |
|  - Inji Mimoto (Wallet Gateway)   |       |  - OpenID4VP Draft-21 Verifier        |
|  - Inji Verify (Verification)     |       |  - Edge-case / Tamper Generator       |
+-----------------------------------+       +---------------------------------------+
```

---

## Supported Protocols & Formats

### 1. OpenID for Verifiable Credential Issuance (OpenID4VCI — Draft 13)
* **Endpoint Discovery**: `/.well-known/openid-credential-issuer`
* **Credential Offer**:
  * Format: `openid-credential-offer://`
  * Grants: `urn:ietf:params:oauth:grant-type:pre-authorized_code`
* **Credential Request**:
  * Formats: `ldp_vc` (W3C Linked Data Proof) and `vc+sd-jwt` (IETF Selective Disclosure JWT)
  * Proof: Proof-of-possession JWT (`proof_type: jwt`)

### 2. OpenID for Verifiable Presentations (OpenID4VP — Draft 21)
* **Authorization Request**:
  * Format: `openid4vp://authorize?response_type=vp_token`
  * Parameters: `client_id`, `presentation_definition`, `nonce`
* **Presentation Submission**:
  * Envelope: `vp_token`
  * Cryptographic Verification: Schema validation, issuer DID resolution, cryptographic signature verification, expiry checks.

---

## Edge Case & Tamper Testing Matrix

| Test Case | Scenario | Expected Outcome | Visual Indicator |
|-----------|----------|------------------|------------------|
| TC-01 | Happy Path Issuance & Presentation (W3C VC) | Valid verification status | Green badge (`VALID`) |
| TC-02 | Happy Path Issuance & Presentation (SD-JWT) | Valid verification status + selective disclosure | Green badge (`VALID`) |
| TC-03 | Expired Credential Presentation | Verification rejected: timestamp expiry check | Red badge (`EXPIRED`) |
| TC-04 | Corrupted Signature Tampering | Verification rejected: signature mismatch | Red badge (`SIGNATURE_MISMATCH`) |
| TC-05 | Cross-Ecosystem Matrix (Mock Issuer to Inji Verify) | Standards compliance holds cross-boundary | Green badge (`PASS`) |
