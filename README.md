# MOSIP Verifiable Credential (VC) Interoperability Playground

![Topic](https://img.shields.io/badge/Topic-02%20VC%20Interoperability%20Playground-0284c7.svg)
![Docker](https://img.shields.io/badge/Docker-Compose%20Ready-2496ED.svg?logo=docker)
![Node](https://img.shields.io/badge/Node.js-v26-339933.svg?logo=node.js)
![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react)
![Standards](https://img.shields.io/badge/Protocols-OpenID4VCI%20%7C%20OpenID4VP-indigo.svg)

A visual workbench for testing whether verifiable credentials survive a full **issue → hold → present → verify** cycle across different implementations. Pick an issuer, a wallet and a verifier from a 3-column matrix, run the flow, and watch every OpenID4VCI (Draft 13) and OpenID4VP (Draft 21) exchange in a live sequence diagram and wire inspector. Every run lands in a pass/fail interoperability report you can export.

The MOSIP side covers Inji Certify, Inji Wallet / Inji Web (via Mimoto) and Inji Verify. The non-MOSIP side is a standards-compliant mock issuer, holder and verifier, so the matrix tests cross-ecosystem interoperability rather than only Inji-to-Inji.

> **Sandbox status:** the MOSIP Collab hostnames currently configured do not resolve, so Inji nodes fall back to emulated responses. The UI labels these runs **Emulated** and the report flags them. See [docs/known-issues.md](docs/known-issues.md).

---

## Contents

- [Architecture](#architecture)
- [Features](#features)
- [Quickstart](#quickstart)
- [Testing](#testing)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Team](#team)
- [Further documentation](#further-documentation)

---

## Architecture

```text
+-----------------------------------------------------------------------------------+
|                         Browser Client (React 19 + Vite 8)                        |
|   - 3-Column Matrix Selector + status badges (Amogh)                              |
|   - Flow Controls: QR offers, tamper mode, results (Amogh)                        |
|   - Interop Report + run history (Amogh)                                          |
|   - Mermaid.js Sequence Visualizer, Live Protocol Inspector (Ayaan)               |
+-----------------------------------------------------------------------------------+
                                        |  REST /api/playground  (x-transaction-id)
                                        v
+-----------------------------------------------------------------------------------+
|                      Node.js / Express 5 BFF Orchestrator                         |
|   - In-Memory Protocol Audit Logger, ring buffer (Aatraya)                        |
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

The design (protocols, frontend state model and data flow) is in [docs/architecture.md](docs/architecture.md), and the logger internals are in [docs/audit-logger-architecture.md](docs/audit-logger-architecture.md).

---

## Features

1. **3-column interoperability matrix**
   - **Issuer:** Inji Certify or Mock OpenID4VCI. **Wallet:** Inji Web / Mobile or Simulated Holder. **Verifier:** Inji Verify or Mock OpenID4VP.
   - The nodes come from one registry (`frontend/src/config/nodes.ts`), so adding an implementation is a single entry.
   - Each column shows a live status badge: Standby → In progress → Holding VC / Done / Rejected / Error.
   - Inji nodes show **Emulated** when the BFF served a fallback response.
2. **Two credential formats, clearly labelled per run**
   - **W3C VC (JSON-LD)** with an `Ed25519Signature2020` linked-data proof (`ldp_vc`).
   - **IETF SD-JWT VC** with salted selective disclosures (`vc+sd-jwt`).
3. **Live issue and present flows**
   - A scannable `openid-credential-offer://` QR code and same-device deep link for the credential offer.
   - A scannable `openid4vp://authorize` QR code for the presentation request, with a warning when a payload exceeds QR capacity.
   - Issued credential summary: wire format, proof type, issuer, type, expiry and SD-JWT disclosure count.
   - Verification card showing **Valid**, **Invalid**, **Expired** or **Signature mismatch**, plus **Valid but Expired** when only the expiry check failed, and the four individual checks.
   - **Run Full Flow** (issue + verify in one click) and **Reset**.
4. **Protocol transparency**
   - Each run carries one `x-transaction-id`, so the inspector and the diagram show its frames together.
   - The Mermaid sequence diagram is generated from the wire logs and marks tampered steps.
   - The Protocol Inspector shows raw requests and responses, with one-click JSON copy.
5. **Tamper / chaos mode (negative paths)**
   - Expire the timestamp or corrupt the signature at presentation time to show that the verifier rejects the credential.
6. **Interoperability report**
   - A matrix of all **16** combinations (2 issuers × 2 wallets × 2 verifiers × 2 formats), built from real runs. Combinations never run show **UNTESTED**.
   - Columns: issuer, wallet, verifier, format, proof type, outcome and error detail.
   - **Run All Combinations** batch runner, a filterable run history, and **Markdown / JSON export** (the Markdown is the submission's interop matrix).
   - A run **passes** when the verifier behaves as expected: it accepts a clean credential, or rejects a tampered one.

---

## Quickstart

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) with Docker Compose, **or**
- Node.js **26** and npm (`engines: node >=26`)

### 1. One command (Docker Compose)
```bash
docker compose up --build
```
- Frontend: <http://localhost:5173>
- Backend BFF: <http://localhost:4000>
- Health check: <http://localhost:4000/api/health>

### 2. Local development
```bash
npm install            # installs both workspaces from the repo root
npm run dev:backend    # terminal 1, BFF on :4000 (tsx watch)
npm run dev:frontend   # terminal 2, Vite on :5173, proxies /api to the BFF
```

Copy `.env.example` to `.env` to point the BFF at other MOSIP endpoints (`MOSIP_INJI_CERTIFY_URL`, `MOSIP_MIMOTO_URL`, `MOSIP_INJI_VERIFY_URL`).

### 3. Try it
1. Keep the default all-Inji selection, or pick other nodes and a format.
2. Click **Run Full Flow**, or run **Trigger "Issue Credential" Flow** followed by **Trigger "Present & Verify" Flow**.
3. Turn on **Enable Tamper Mode**, tick an attack and run again to see the rejection.
4. Open **Interop Matrix Report**, click **Run All Combinations**, then export the report as **Markdown**.

---

## Testing

| Command | What it runs |
| --- | --- |
| `npm test` | All unit, component and HTTP tests (Vitest), frontend then backend |
| `npm --prefix frontend run test:watch` | Frontend tests in watch mode |
| `npm run test:interop` | The TC-01 to TC-05 protocol scenarios against a live BFF (falls back to the mock engine) |
| `npm run build` | Type-checks and builds both workspaces |

CI (`.github/workflows/ci.yml`, Node 26) runs `npm ci`, both builds, `npm test`, `docker compose config` and `npm run test:interop` on every push and pull request to `main`.

Some backend tests are marked `it.fails`. Each one pins a **known bug**: the test passes while the bug exists and fails once it's fixed, so whoever fixes it switches it to `it`. See [docs/testing.md](docs/testing.md) for the full guide and [docs/test-cases.md](docs/test-cases.md) for the manual scenarios.

---

## API reference

All playground endpoints accept an optional `x-transaction-id` header. The UI sends one per run, and the BFF tags every audit frame of that run with it. If it is missing, the BFF generates `tx-xxxxxxxx`.

### `GET /api/health`
Returns `{ status, service, version, timestamp, collabSandbox: { injiCertify, mimoto, injiVerify } }`.

### `POST /api/playground/issue`
Runs the OpenID4VCI issuance flow.
```json
{
  "issuer": "mock-openid4vci",
  "wallet": "mock-wallet",
  "format": "w3c-vc",
  "credentialSubject": {
    "fullName": "Aaditya Sharma",
    "dob": "1995-08-15",
    "nationalId": "MOSIP-IND-9876-5432-1098",
    "email": "aaditya.sharma@example.org",
    "country": "IND"
  }
}
```
| Field | Values |
| --- | --- |
| `issuer` | `inji-certify`, `mock-openid4vci` |
| `wallet` | `inji-wallet`, `mock-wallet` |
| `format` | `w3c-vc`, `sd-jwt` |

Response: `{ success, issuer, wallet, format, credentialOffer, issuedCredential, protocolLogs[] }`. When Inji Certify is unreachable, it also includes `isSandboxFallback: true` and a `notice`.

### `POST /api/playground/verify`
Runs the OpenID4VP presentation and verification flow.
```json
{
  "verifier": "mock-openid4vp",
  "wallet": "mock-wallet",
  "format": "w3c-vc",
  "credentialOrToken": { "...": "the issuedCredential from /issue" },
  "tamperPayload": { "forceExpired": false, "corruptSignature": true }
}
```
Response: `{ success, isValid, verificationResult: { status, checks: { formatCheck, signatureValid, notExpired, schemaCompliant }, details, verifiedClaims }, presentationDefinition, protocolLogs[] }`.
- `status` is one of `VALID`, `INVALID`, `EXPIRED`, `SIGNATURE_MISMATCH`.
- `protocolLogs` contains the **whole transaction**, issuance frames included.

### `GET /api/playground/logs` · `DELETE /api/playground/logs`
`GET` returns the latest 100 audit frames (newest first) as `{ count, logs }`. `DELETE` clears the buffer.

### `GET /api/playground/matrix-status`
A static list of 8 pre-wired combinations, kept for compatibility. The UI computes its report from real runs instead.

### Proxy gateway (`backend/src/routes/proxyGateway.js`, not mounted yet)
`ALL /api/proxy/:target/*splat` forwards to `INJI_CERTIFY`, `INJI_VERIFY`, `MOCK_ISSUER` or `MOCK_VERIFIER` through the audit client. It returns the upstream body plus `_auditTrail`.

---

## Project structure

```
.
├── backend/                     Express 5 BFF (TypeScript 7, Vitest)
│   ├── src/
│   │   ├── index.ts             app bootstrap, CORS, /api/health
│   │   ├── routes/playground.ts /issue, /verify, /logs, /matrix-status
│   │   ├── routes/proxyGateway.js  audited proxy to Collab / mocks
│   │   ├── middleware/auditInterceptor.js  axios client that records audit frames
│   │   ├── mocks/mockService.ts OpenID4VCI / OpenID4VP mock engine
│   │   └── utils/               RingBuffer.js, redactor.js
│   ├── scripts/test-interop.ts  TC-01 to TC-05 runner
│   └── tests/                   Vitest unit + HTTP tests
├── frontend/                    React 19 + Vite 8 + Tailwind 4
│   └── src/
│       ├── App.tsx              layout; wires the run hook into the panels
│       ├── api/client.ts        typed BFF client (x-transaction-id, error mapping)
│       ├── hooks/usePlaygroundRun.ts  run state machine, logs, history
│       ├── config/nodes.ts      node/format registry, combination builder
│       ├── components/          MatrixSelector, FlowControls, InteropMatrixReport,
│       │                        Header, SequenceDiagram, ProtocolInspector (+ *.test.tsx)
│       └── test/                Vitest setup and fixtures
├── docs/                        architecture, audit logger, tests, demo script, known issues
├── docker-compose.yml           frontend + BFF (node:26-alpine)
└── .github/workflows/ci.yml     build, test, interop suite
```

---

## Team

- **Amogh (Lead Frontend):** 3-column matrix UI, dynamic status badges, flow execution controls, run state and the interoperability report.
- **Ayaan (Frontend Visualizations):** Protocol Inspector (wire payloads) and the dynamic Mermaid.js sequence visualizer.
- **Aatraya (Lead Backend):** Express BFF orchestrator, proxy gateway to the MOSIP Collab sandbox, and the [in-memory audit logger](docs/audit-logger-architecture.md).
- **Aryan (API Integration & Mocks):** standards compliance (OpenID4VCI Draft 13, OpenID4VP Draft 21), W3C VC JSON-LD and SD-JWT formats, negative test cases.
- **Yug (DevOps & Submission Assets):** monorepo, Docker Compose, CI, documentation and the demo video script.

---

## Further documentation

| Document | Contents |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Protocols, components, frontend state model and data flow |
| [docs/audit-logger-architecture.md](docs/audit-logger-architecture.md) | Ring buffer, redaction pipeline, audit frame schema |
| [docs/testing.md](docs/testing.md) | Automated test suites, conventions, known-bug tests |
| [docs/test-cases.md](docs/test-cases.md) | Manual scenarios TC-01 to TC-06 |
| [docs/known-issues.md](docs/known-issues.md) | Open bugs and interoperability gaps found during testing |
| [docs/video-demo-script.md](docs/video-demo-script.md) | 3–5 minute demo script |

Licensed under Apache-2.0.
