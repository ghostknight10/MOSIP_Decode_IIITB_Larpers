# Testing Guide

The playground has three layers of tests:

| Layer | Tool | Command | Count |
| --- | --- | --- | --- |
| Frontend unit, component and integration | Vitest 5 + Testing Library + jsdom | `npm --prefix frontend test` | 375 |
| Backend unit and HTTP | Vitest 5 (node) | `npm --prefix backend test` | 175 |
| Protocol scenarios TC-01 to TC-05 | `backend/scripts/test-interop.ts` | `npm run test:interop` | 5 |

`npm test` at the repo root runs the frontend suite, then the backend suite. CI runs it on every push and pull request to `main`, after both builds and before the interop scenarios. Manual UI procedures are in [test-cases.md](./test-cases.md).

---

## Frontend (`frontend/src/**/*.test.ts(x)`)

Configured in `frontend/vite.config.ts` (`test.environment: 'jsdom'`, setup file `src/test/setup.ts`). Tests sit next to the code they cover.

| File | Tests | Covers |
| --- | --- | --- |
| `config/nodes.test.ts` | 10 | Registry integrity (roles, unique IDs, MOSIP and non-MOSIP per role, verifier `client_id`s), wire formats, lookups, `allCombinations()` product and keys |
| `config/scenarios.test.ts` | 4 | Presets: unique IDs, valid combinations, TC-01 to TC-05 coverage, both cross-ecosystem directions |
| `api/client.test.ts` | 13 | Request shape, `x-transaction-id` header, `ApiError` mapping for `success:false` / non-2xx / non-JSON, unreachable BFF message, transaction ID format, live log stream (SSE): only protocol logs passed on, unsubscribe, no-op without `EventSource` |
| `hooks/usePlaygroundRun.test.ts` | 52 | Issue/verify success and failure, PASS/FAIL semantics (clean vs tampered), transaction ID reuse, log de-duplication and newest-first order, per-phase sandbox fallback, failed checks, selection reset rules, busy locking, full flow, batch runs, history persistence and 200-run cap, clear/reset, `getProofType`, `mergeLogs`, streamed frames of the run in flight (duplicates, other runs and idle frames ignored), runs stamped with the component build |
| `lib/credential.test.ts` | 5 | JWT payload decoding (base64url, disclosures ignored, malformed input) |
| `lib/sdjwt.test.ts` | 9 | SD-JWT parsing (the mock token's real disclosure, array-element and malformed disclosures, key-binding JWT), `_sd` digest checks via WebCrypto, unavailable WebCrypto |
| `lib/claims.test.ts` | 15 | JSONPath claim names, requested / held / shared claims (W3C and SD-JWT), four-way classification |
| `lib/failureLayer.test.ts` | 12 | Layer per failure cause, lowest broken layer wins, legend |
| `lib/participants.test.ts` | 12 | Role mapping for generic and MOSIP product names, chronological order, replay slice |
| `lib/importCredential.test.ts` | 7 | Importing an outside credential: W3C (bare and wrapped), SD-JWT with decoded disclosures, base64url mDoc, error messages |
| `lib/fallback.test.ts` | 4 | Plain-language emulation notice per phase |
| `lib/jsonHighlight.test.tsx` | 11 | Token kinds, exact text preserved, escaped quotes, primitives |
| `components/MatrixSelector.test.tsx` | 24 | Registry-driven radios and `aria-checked`, selection callbacks, locking while running, per-role status (table-driven `columnStatus`), verifier verdict, per-role Emulated badge |
| `components/FlowControls.test.tsx` | 45 | Action wiring, edited subject, tamper options (wrong type, replay, "tamper mode on, nothing ticked" → no payload), scenarios, credential import (hand-off, error, imported label), offer and OpenID4VP QR/deep links, by-reference QR for oversized payloads, clipboard, W3C and SD-JWT summaries, verdict card with "Valid but Expired" and the optional holder-binding check, URI builders, `activeTamper` |
| `components/flow/CredentialInspector.test.tsx` | 7 | Collapsed by default, W3C claims and proof, labelled SD-JWT parts, decoded disclosures with digest result, unavailable WebCrypto, undecodable token |
| `components/flow/SharedClaimsPanel.test.tsx` | 5 | Custody summary, minimal sharing, over-disclosure warning, missing claims, labelled groups |
| `components/RunTimeline.test.tsx` | 5 | Protocol order, role mapping for emulated services, status and tamper in text, current/not-yet steps |
| `components/RunPlayer.test.tsx` | 8 | Live state, stepping, slider, back to live, autoplay with fake timers, pause, reduced motion |
| `components/InteropMatrixReport.test.tsx` | 35 | Heatmap (cells, accessible names, combination filter), list view, UNTESTED coverage, latest clean run per combination, real vs emulated scores and warning, negative-path stats, filters including layer, batch progress, Markdown/JSON export with layers, confirm-before-clear, `scoreMatrix`, `toMarkdown` escaping, component-build filter |
| `components/Header.test.tsx` | 7 | Connecting / Online / Offline, view tabs and `aria-current`, run count |
| `components/SequenceDiagram.test.tsx` | 12 | (mermaid mocked) light token theme, placeholder, arrival order with each run kept contiguous, one phase note per protocol per run, participant mapping including emulated Inji Verify, tamper note, action sanitising, re-render, render error |
| `components/ProtocolInspector.test.tsx` | 11 | Empty state, list contents, default newest selection, switching logs, request tab, copy JSON, clear callback, request/response headers, Live chip for Collab traffic, scrolling only its own list (no `scrollIntoView`) |
| `test/design.test.ts` | 46 | Design system: every token used, WCAG contrast for each text pairing (4.5:1) and for focus rings and icons (3:1), a guardrail that fails on banned patterns in components (gradients, large/coloured shadows, pulses, wide tracking, blur, oversized radii, raw palette colours, `transition-all`, text under 12px, inline gradients and animations), and checks on `index.css` (no raw colours outside `@theme`, no gradients, keyframes or extra fonts; canvas background, Inter and the accent focus ring). See [design-tokens.md](./design-tokens.md) |
| `App.test.tsx` | 16 | Whole app against a stubbed BFF (`fetch`): health states, issue → verify with one transaction ID, report recording clean and tampered runs, error and emulation banners, run-all, compact empty state, current-run vs all-runs scope, presets (tamper and matrix), replay, phone raw-message toggle, plain-information notice without emulation |

Conventions:

- Query by role and accessible name (`getByRole('button', { name: /Run Full Flow/ })`), and drive interactions with `userEvent`.
- Use `src/test/fixtures.ts` (`makeRun`, `makeLog`) instead of hand-building records.
- Mock the network at the edge: the hook tests mock `api/client`, and the App tests stub `fetch`. Mermaid is always mocked, because jsdom can't lay out SVG.
- `src/test/setup.ts` works around Node ≥ 25 defining its own global `localStorage`, which otherwise hides jsdom's. It does nothing on older Node versions.

## Backend (`backend/tests/*.test.ts`)

Configured in `backend/vitest.config.ts`. Tests live outside `src/`, so `tsc` doesn't compile them into `dist/`.

| File | Tests | Covers |
| --- | --- | --- |
| `RingBuffer.test.ts` | 9 | Ordering, limits, eviction, no duplicates past capacity, per-transaction lookup and sort, clear, singleton capacity |
| `redactor.test.ts` | 28 | Every sensitive key including OpenID4VCI grant secrets (`pre-authorized_code`, `tx_code`, `code`) and API keys, case-insensitive, nested, in arrays; VC artefacts kept but still scanned; no input mutation |
| `auditInterceptor.test.ts` | 18 | Audit frame fields plus the ProtocolLog fields the UI reads, sequence numbers, redaction, form-urlencoded bodies, HTTP and network errors, protocol and format normalisation (including mDoc), tamper annotations (local axios adapter, no network) |
| `mockService.test.ts` | 43 | Real signatures: Ed25519Signature2020 / did:key (W3C), ES256 + x5c + cnf (SD-JWT), COSE_Sign1 MSO (mDoc); expired and wrong-type variants still validly signed; claim aliases; the verifier for every format × tamper (expired, corrupt signature, wrong type, replay), single-use nonces, holder binding (W3C presentation proof, SD-JWT key-binding JWT, mDoc device signature), forged disclosures, malformed input |
| `collab.test.ts` | 5 | What Inji Verify receives in tamper mode: re-issued expired credential, SD-JWT signature-only corruption, foreign credentials edited in place without mutation |
| `playground.routes.test.ts` | 48 | `/api/playground/*` over real HTTP with axios mocked as the Collab sandbox: request validation, transaction IDs, generic 500s, SSE stream, references (`/ref/:id`); live Inji Certify discovery, Mimoto lookup, unsupported format, same-origin credential endpoint, incremental recording; Inji Verify v2 verdict and check mapping, v1 fallback, real tampering, SD-JWT body; fallback when unreachable, HTML or 5xx; real Inji issuance with a test identity (eSignet cookie and detail binding, Mimoto token, OpenID4VCI 1.0 request, no secrets in logs, fallback naming the refusing step) |
| `proxyGateway.test.ts` | 13 | Proxy against a local upstream server: forwarding, query strings, non-canonical JSON (no hang), header allowlist (no cookies), no GET body, percent-encoded prefix, case-insensitive targets and sandbox flag, redacted `_auditTrail`, error statuses, no internal error text |
| `components.test.ts` | 5 | Collab component fingerprints: API generation, UI build, protocol and hashes; v1 / Draft 13 detection; login Certify; caching; unreachable services |
| `requireToken.test.ts` | 6 | Optional `PLAYGROUND_TOKEN`: open when unset, 401 for missing, wrong or prefix tokens, accepts the right one, `/api/health` stays open |

### Known-bug tests (`it.fails`)

None are open. To pin a newly found bug, write the test for the correct behaviour as `it.fails(...)`, which passes while the bug exists, and list the bug in [known-issues.md](./known-issues.md). Whoever fixes it changes `it.fails(` to `it(` in the same commit.

## Interoperability report (`npm run report:interop`)

`backend/scripts/interop-report.ts` runs every supported combination clean and every attack against each verifier through a running BFF (`BFF_URL`, default `http://localhost:4000`), and writes Markdown and JSON. The committed [interop-report.md](./interop-report.md) is a live run against the Collab sandbox with real Inji issuance. The nightly workflow regenerates it and posts it to the GitHub Actions run summary.

```bash
npm run dev:backend   # with COLLAB_TEST_INDIVIDUAL_ID in .env for real issuance
npm run report:interop -- --out "$PWD/docs/interop-report.md" --json "$PWD/docs/interop-report.json"
```

## Protocol scenarios (`npm run test:interop`)

`backend/scripts/test-interop.ts` runs TC-01 to TC-05 against a live BFF at `BFF_URL` (default `http://localhost:4000`). If none is running, it calls the mock engine directly. It exits non-zero on any failure.

## Writing new tests

- Frontend: put `Thing.test.tsx` next to `Thing.tsx`. Backend: put it in `backend/tests/`.
- Keep tests offline: mock `fetch` or axios (the route tests answer Collab calls by URL fragment with `collab()`), or start a local server on port `0`.
- Run `npm --prefix frontend run test:watch` while developing.
- `npm run build` type-checks frontend tests too (they're in `src/`), so type errors in tests fail the build.
