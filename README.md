# MOSIP Verifiable Credential (VC) Interoperability Playground

![Topic](https://img.shields.io/badge/Topic-02%20VC%20Interoperability%20Playground-0284c7.svg)
![Docker](https://img.shields.io/badge/Docker-Compose%20Ready-2496ED.svg?logo=docker)
![Node](https://img.shields.io/badge/Node.js-v26-339933.svg?logo=node.js)
![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react)
![Standards](https://img.shields.io/badge/Protocols-OpenID4VCI%20%7C%20OpenID4VP-indigo.svg)

A visual workbench for testing whether verifiable credentials survive a full **issue → hold → present → verify** cycle across different implementations. Pick an issuer, a wallet and a verifier from a 3-column matrix, run the flow, and watch every OpenID4VCI (Draft 13) and OpenID4VP (Draft 21) exchange in a live sequence diagram and wire inspector. Every run lands in a pass/fail interoperability report you can export.

The MOSIP side covers Inji Certify, Inji Wallet / Inji Web (via Mimoto) and Inji Verify. The non-MOSIP side is a standards-compliant mock issuer, holder and verifier, so the matrix tests cross-ecosystem interoperability rather than only Inji-to-Inji.

> **Sandbox status:** Inji Verify (v2 API), Inji Certify's metadata and credential endpoint, and Mimoto's issuer registry are called **live** on the MOSIP Collab sandbox. The mock issuer signs for real, so live Inji Verify accepts clean mock credentials and rejects tampered ones. With `COLLAB_TEST_INDIVIDUAL_ID` set (e.g. MOSIP's published test identity `8267411578`), Inji Certify issues a **real credential** after an automated eSignet login, and Inji Verify verifies it, end to end on the real Inji stack. Without it, Certify's credential is emulated, or you can import one you obtained yourself. The UI labels emulated steps and the report flags them. See [docs/known-issues.md](docs/known-issues.md#what-runs-live-today) and the [upstream issue drafts](docs/upstream-issues.md).

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
   - Only the roles that were actually answered by the fallback show **Emulated**, and a banner names them in plain language.
2. **One-click scenarios**
   - Presets for TC-01 to TC-05, TC-07 and TC-08: the happy paths, an expired credential, a corrupted signature, both cross-ecosystem directions, an mDoc presentation and a replayed presentation. A preset sets the matrix and the attack it applies, so you can see exactly what it ran.
3. **Three credential formats, really signed, clearly labelled per run**
   - **W3C VC (JSON-LD)** with an `Ed25519Signature2020` proof from a `did:key` issuer (`ldp_vc`).
   - **IETF SD-JWT VC**, ES256 with an `x5c` certificate, salted selective disclosures and a key-binding JWT (`vc+sd-jwt`).
   - **ISO 18013-5 mDoc** with a COSE_Sign1 Mobile Security Object and a device-signed DeviceResponse (`mso_mdoc`).
   - Presentations are bound to the verifier's single-use nonce (holder binding); the wallet discloses only the requested claims.
4. **Live issue and present flows**
   - Scannable `openid-credential-offer://` and `openid4vp://authorize` QR codes, with plain wording on which device does what. Phones lead with the same-device link, and payloads too large for a QR code are passed by reference (`credential_offer_uri`, `presentation_definition_uri`).
   - **Inspect credential:** SD-JWTs are split into labelled header, payload, signature and disclosure parts, with a per-disclosure check that its SHA-256 digest is in `_sd`. W3C credentials show subject claims and the proof; mDocs show docType, validity and data elements.
   - **Use a credential from outside the playground:** paste a W3C credential, SD-JWT or mDoc (for example from Inji Web) and present it to either verifier.
   - Verification card showing **Valid**, **Invalid**, **Expired** or **Signature mismatch**, plus **Valid but Expired** when only the expiry check failed, and the individual checks (holder binding where the verifier checks it).
   - **What was shared:** the claims the verifier asked for, received and never saw, including any over-disclosure.
5. **Protocol transparency, beside the controls**
   - On wide screens the live protocol view stays next to the buttons. It shows the current run by default, with an "All runs" toggle.
   - A step timeline (also the phone view), the Mermaid sequence diagram, and the raw-message inspector. Every run carries one `x-transaction-id`.
   - **Replay:** step through a run, or play it back, and the timeline, diagram and inspector follow.
6. **Tamper / chaos mode (negative paths)**
   - Expire the timestamp or corrupt the signature at presentation time to show that the verifier rejects the credential.
7. **Interoperability report**
   - A heatmap of all **20** supported combinations (issuer × wallet rows, verifier × format columns), built from real runs. Untested cells say **UNTESTED**, and clicking a cell filters the run history. A list view is also available.
   - Real and emulated results are scored separately ("Real: x/y pass · Emulated: x/y pass"), so a pass against the mock engine is never presented as an Inji result.
   - Failures are tagged with the interoperability layer they broke at: Technical, Syntactical, Semantic or Organizational, after Schumm et al. (2025).
   - **Run All Combinations**, filters (format, outcome, mode, layer), and **Markdown / JSON export** (the Markdown is the submission's interop matrix).
   - A run **passes** when the verifier behaves as expected: it accepts a clean credential, or rejects a tampered one.

The UI choices are grounded in published research and in comparable tools. See [docs/ui-design.md](docs/ui-design.md).

---

## Quickstart

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) with Docker Compose, **or**
- Node.js **26** and npm (`engines: node >=26`)

### 0. Configuration (both ways)
```bash
cp .env.example .env   # once; the BFF, Vite and docker compose all read this file
```
The defaults work as they are. They include the published Collab test identity (`COLLAB_TEST_INDIVIDUAL_ID=8267411578`) for real Inji Certify issuance; empty it to emulate the credential instead. See the comments in `.env.example` for every setting.

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

Before sharing a running instance with others, set `PLAYGROUND_TOKEN` in `.env` to a long random value (`openssl rand -hex 24`): the BFF then answers only the frontend's proxy. The MOSIP endpoints (`MOSIP_INJI_CERTIFY_URL`, `MOSIP_INJI_MIMOTO_URL`, `MOSIP_INJI_VERIFY_URL`) and allowed origins (`FRONTEND_URL`) are also set there.

### 3. Try it
1. Click a **Quick scenario** (e.g. **TC-01 Happy path · W3C VC**), or pick nodes yourself and press **Run Full Flow**.
2. Open **Inspect credential** and **What was shared**, then use the replay controls in the live protocol view to step through the exchange.
3. Run **TC-03**, **TC-04** or **TC-08** (or turn on **Enable Tamper Mode** yourself) to see the verifier reject an expired, forged or replayed presentation.
4. Open **Interop Matrix Report**, click **Run All Combinations**, select heatmap cells to drill in, then export the report as **Markdown**.

---

## Testing

| Command | What it runs |
| --- | --- |
| `npm test` | All unit, component and HTTP tests (Vitest), frontend then backend |
| `npm --prefix frontend run test:watch` | Frontend tests in watch mode |
| `npm run test:interop` | The TC-01 to TC-05 protocol scenarios against a live BFF (falls back to the mock engine) |
| `npm run build` | Type-checks and builds both workspaces |

CI (`.github/workflows/ci.yml`, Node 26) runs `npm ci`, both builds, `npm test`, `docker compose config`, a Docker Compose smoke test (BFF health through the frontend's proxy) and `npm run test:interop` on every push and pull request to `main`. All tests run offline: Collab calls are mocked.

A newly found bug can be pinned with `it.fails`, which passes while the bug exists; whoever fixes it switches it to `it`. None are open. See [docs/testing.md](docs/testing.md) for the full guide and [docs/test-cases.md](docs/test-cases.md) for the manual scenarios.

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
| `format` | `w3c-vc`, `sd-jwt`, `mso-mdoc` |

Response: `{ success, issuer, wallet, format, credentialOffer, issuedCredential, proofType, protocolLogs[] }`. With `inji-certify` the credential is emulated (see E-1), so the response also includes `isSandboxFallback: true` and a `notice` explaining what ran live.

Invalid bodies get a JSON `400` naming the field: unknown `issuer`/`wallet`/`format`, a non-string subject field, or non-boolean tamper flags. Internal errors get a generic `500`.

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
Response: `{ success, isValid, verificationResult: { status, checks: { formatCheck, signatureValid, notExpired, schemaCompliant }, details, verifiedClaims }, presentationDefinition, client_id, nonce, protocolLogs[] }`.
- `status` is one of `VALID`, `INVALID`, `EXPIRED`, `SIGNATURE_MISMATCH`. With `inji-verify` it comes from Inji Verify's live `verificationStatus`.
- `tamperPayload` flags: `forceExpired`, `corruptSignature`, `wrongCredentialType`, `replayPresentation`. Tampering is real: the mock issuer re-issues an expired or wrong-type credential, the signature bytes are altered, or the wallet answers with an earlier request's nonce.
- With `inji-verify` the credential goes to Inji Verify's `/v2/vc-verification` (v1 as a fallback), which reports the checks separately. It verifies a credential, not a presentation, so there is no nonce or holder binding to check.
- `protocolLogs` contains the **whole transaction**, issuance frames included.

### `GET /api/playground/logs` · `DELETE /api/playground/logs`
`GET` returns the latest 100 audit frames (newest first) as `{ count, logs }`. `DELETE` clears the buffer.

### `GET /api/playground/ref/:id`
Serves a credential offer or presentation definition by reference (`credentialOfferUri` / `presentationDefinitionUri` in `/issue` and `/verify` responses), for 10 minutes.

### `GET /api/playground/logs/stream`
Server-Sent Events: each new frame as it is recorded, `{ "action": "CLEAR_LOGS" }` when cleared, and a comment heartbeat every 25 s. Live Collab steps carry `live: true`.

### `GET /api/playground/matrix-status`
A static list of 8 pre-wired combinations, kept for compatibility. The UI computes its report from real runs instead.

### Proxy gateway (`backend/src/routes/proxyGateway.js`)
`ALL /api/proxy/:target/*splat` forwards to `INJI_CERTIFY`, `INJI_VERIFY`, `INJI_MIMOTO`, `MOCK_ISSUER` or `MOCK_VERIFIER` through the audit client. It returns the upstream body plus `_auditTrail`. Only `Accept`, `Accept-Language`, `Content-Type`, `Authorization`, `DPoP`, `x-transaction-id` and `X-Audit-*` headers are forwarded.

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
│   │   ├── services/collab.ts   live calls to Inji Certify, Mimoto and Inji Verify
│   │   ├── mocks/mockService.ts OpenID4VCI issuer and OpenID4VP verifier (real signatures, nonces)
│   │   ├── mocks/wallet.ts      simulated holder: tampering, presentations, selective disclosure
│   │   ├── mocks/crypto.ts      mock keys, Ed25519 Data Integrity, ES256 JWT
│   │   ├── mocks/mdoc.ts        ISO 18013-5 mDoc issue, present, verify
│   │   └── utils/               RingBuffer.js, redactor.js
│   ├── scripts/test-interop.ts  TC-01 to TC-05 runner
│   └── tests/                   Vitest unit + HTTP tests
├── frontend/                    React 19 + Vite 8 + Tailwind 4 (design tokens in src/index.css)
│   └── src/
│       ├── App.tsx              layout: matrix, actions beside the live view, report tab
│       ├── api/client.ts        typed BFF client (x-transaction-id, error mapping)
│       ├── hooks/usePlaygroundRun.ts  run state machine, logs, history
│       ├── config/              nodes.ts (registry), scenarios.ts (TC presets)
│       ├── lib/                 credential, sdjwt, claims, failureLayer, participants,
│       │                        fallback, jsonHighlight (pure, unit-tested)
│       ├── components/          MatrixSelector, FlowControls, RunTimeline, RunPlayer,
│       │   │                    InteropMatrixReport, Header, SequenceDiagram, ProtocolInspector
│       │   ├── flow/            IssuePhase, PresentPhase, QrPanel, ScenarioBar, VerdictCard,
│       │   │                    CredentialInspector, SharedClaimsPanel, …
│       │   └── report/          InteropHeatmap
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
| [docs/test-cases.md](docs/test-cases.md) | Manual scenarios TC-01 to TC-08 |
| [docs/known-issues.md](docs/known-issues.md) | What runs live, open issues and interoperability findings |
| [docs/upstream-issues.md](docs/upstream-issues.md) | Draft reports for MOSIP / Inji (one to report privately) |
| [docs/ui-design.md](docs/ui-design.md) | UI research: comparable tools, papers, and the design decisions they led to |
| [docs/design-tokens.md](docs/design-tokens.md) | Colours, type and visual rules (read before changing any UI) |
| [docs/video-demo-script.md](docs/video-demo-script.md) | 3–5 minute demo script |

Licensed under Apache-2.0.
