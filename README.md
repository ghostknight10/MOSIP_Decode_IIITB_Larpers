# MOSIP Verifiable Credential (VC) Interoperability Playground

[![Topic](https://img.shields.io/badge/Topic-02%20VC%20Interoperability%20Playground-0284c7.svg)](#)
[![Docker](https://img.shields.io/badge/Docker-Compose%20Ready-2496ED.svg?logo=docker)](#)
[![Node](https://img.shields.io/badge/Node.js-v22-339933.svg?logo=node.js)](#)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react)](#)
[![Standards](https://img.shields.io/badge/Protocols-OpenID4VCI%20%7C%20OpenID4VP-indigo.svg)](#)

A developer-first workbench and visual testing harness for validating cross-ecosystem interoperability across **MOSIP reference implementations** (Inji Certify, Inji Web/Mobile Wallet via Mimoto, and Inji Verify) and independent **OpenID4VCI (Draft 13)** and **OpenID4VP (Draft 21)** standards-compliant engines.

---

## Architecture Topology

```
+-----------------------------------------------------------------------------------+
|                                Browser Client (UI)                                |
|   - 3-Column Matrix Selector (Amogh)    - Mermaid.js Dynamic Visualizer (Ayaan)   |
|   - Flow Execution Controls (Amogh)     - Live Protocol Inspector (Ayaan)         |
+-----------------------------------------------------------------------------------+
                                        |  REST (/api/playground)
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

## Team Roles & Allocation

* **Amogh (Lead Frontend):** 3-Column Matrix UI, dynamic status badges, and interactive workflow execution controls.
* **Ayaan (Frontend Visualizations):** Protocol Inspector (wire payloads, syntax highlighting) and dynamic Mermaid.js sequence visualizer.
* **Aatraya (Lead Backend):** Express BFF Orchestrator, proxy gateway to MOSIP Collab sandbox, and [in-memory audit logging middleware](docs/audit-logger-architecture.md).
* **Aryan (API Integration & Mocks):** Standards compliance (OpenID4VCI Draft 13, OpenID4VP Draft 21), W3C VC JSON-LD vs. SD-JWT formats, and negative test edge cases.
* **Yug (DevOps & Submission Assets):** Monorepo architecture, Docker Compose orchestration, documentation, API specifications, and demonstration video script.

---

## Quickstart Guide

### Prerequisites
* [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/)
* Or locally: Node.js >= 20.x, npm >= 10.x

### 1. One-Command Execution (Docker Compose)
Run the entire stack (Frontend + Backend BFF) with a single command:
```bash
docker compose up --build
```
* **Frontend Web App:** [http://localhost:5173](http://localhost:5173)
* **Backend BFF API:** [http://localhost:4000](http://localhost:4000)
* **API Health Check:** [http://localhost:4000/api/health](http://localhost:4000/api/health)

### 2. Local Manual Setup (Without Docker)

#### Terminal 1 — Backend BFF
```bash
cd backend
npm install
npm run dev
```

#### Terminal 2 — Frontend UI
```bash
cd frontend
npm install
npm run dev
```

### 3. Automated Protocol Test Suite (TC-01 through TC-05)
Validate protocol conformance across OpenID4VCI and OpenID4VP with a single command:
```bash
npm run test:interop
```

---

## Key Features

1. **3-Column Interoperability Matrix:**
   * Select any permutation of **Issuer** (`Inji Certify` vs `Mock OpenID4VCI`), **Wallet** (`Inji Web` vs `Simulated Wallet`), and **Verifier** (`Inji Verify` vs `Mock OpenID4VP`).
2. **Dual Credential Spec Support:**
   * **W3C VC (JSON-LD)** with Linked Data Proofs (`ldp_vc`).
   * **IETF SD-JWT VC** with salted disclosures and selective disclosure (`vc+sd-jwt`).
3. **Live Protocol Wire Inspector:**
   * Inspect raw requests, responses, HTTP headers, and protocol parameters in real time.
   * One-click JSON copy for debugging and submission auditing.
4. **Dynamic Sequence Visualization (Mermaid.js):**
   * Automatically derives interactive sequence diagrams from HTTP transaction logs.
5. **Tamper / Chaos Mode (Negative Path Testing):**
   * Simulate expired timestamps and corrupted signatures to prove verifier defense mechanisms.
6. **Interoperability Certification Report:**
   * View pass/fail status across all 8 matrix combinations with exportable scorecard.

---

## API Documentation

### `POST /api/playground/issue`
Executes OpenID4VCI issuance flow.
* **Request:**
  ```json
  {
    "issuer": "mock-openid4vci",
    "wallet": "mock-wallet",
    "format": "w3c-vc",
    "credentialSubject": {
      "fullName": "Aaditya Sharma",
      "dob": "1995-08-15",
      "nationalId": "MOSIP-IND-9876-5432-1098"
    }
  }
  ```
* **Response:**
  Returns `credentialOffer`, `issuedCredential`, and raw `protocolLogs`.

### `POST /api/playground/verify`
Executes OpenID4VP verification flow.
* **Request:**
  ```json
  {
    "verifier": "mock-openid4vp",
    "wallet": "mock-wallet",
    "format": "w3c-vc",
    "credentialOrToken": { ... }
  }
  ```
* **Response:**
  Returns `isValid`, `verificationResult` (checks for format, signature, expiry, schema), and `protocolLogs`.

### `GET /api/playground/logs`
Returns in-memory captured protocol audit logs.

### `DELETE /api/playground/logs`
Clears protocol audit logs.

---

## Test Scenarios
Refer to [docs/test-cases.md](docs/test-cases.md) for 5 complete test cases:
* **TC-01:** Happy Path W3C VC Issuance & Verification
* **TC-02:** Happy Path SD-JWT VC Issuance & Verification
* **TC-03:** Negative Test — Expired Credential Presentation
* **TC-04:** Negative Test — Corrupted Cryptographic Signature
* **TC-05:** Cross-Ecosystem Boundary Test (Mock to Inji & Inji to Mock)
