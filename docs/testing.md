# Testing Guide

The playground has three layers of tests:

| Layer | Tool | Command | Count |
| --- | --- | --- | --- |
| Frontend unit, component and integration | Vitest 5 + Testing Library + jsdom | `npm --prefix frontend test` | 328 |
| Backend unit and HTTP | Vitest 5 (node) | `npm --prefix backend test` | 85 (77 + 8 known-bug) |
| Protocol scenarios TC-01 to TC-05 | `backend/scripts/test-interop.ts` | `npm run test:interop` | 5 |

`npm test` at the repo root runs the frontend suite, then the backend suite. CI runs it on every push and pull request to `main`, after both builds and before the interop scenarios. Manual UI procedures are in [test-cases.md](./test-cases.md).

---

## Frontend (`frontend/src/**/*.test.ts(x)`)

Configured in `frontend/vite.config.ts` (`test.environment: 'jsdom'`, setup file `src/test/setup.ts`). Tests sit next to the code they cover.

| File | Tests | Covers |
| --- | --- | --- |
| `config/nodes.test.ts` | 10 | Registry integrity (roles, unique IDs, MOSIP and non-MOSIP per role, verifier `client_id`s), wire formats, lookups, `allCombinations()` product and keys |
| `config/scenarios.test.ts` | 4 | Presets: unique IDs, valid combinations, TC-01 to TC-05 coverage, both cross-ecosystem directions |
| `api/client.test.ts` | 11 | Request shape, `x-transaction-id` header, `ApiError` mapping for `success:false` / non-2xx / non-JSON, unreachable BFF message, transaction ID format |
| `hooks/usePlaygroundRun.test.ts` | 43 | Issue/verify success and failure, PASS/FAIL semantics (clean vs tampered), transaction ID reuse, log de-duplication and newest-first order, per-phase sandbox fallback, failed checks, selection reset rules, busy locking, full flow, batch runs, history persistence and 200-run cap, clear/reset, `getProofType`, `mergeLogs` |
| `lib/credential.test.ts` | 4 | JWT payload decoding (base64url, disclosures ignored, malformed input) |
| `lib/sdjwt.test.ts` | 9 | SD-JWT parsing (the mock token's real disclosure, array-element and malformed disclosures, key-binding JWT), `_sd` digest checks via WebCrypto, unavailable WebCrypto |
| `lib/claims.test.ts` | 13 | JSONPath claim names, requested / held / shared claims (W3C and SD-JWT), four-way classification |
| `lib/failureLayer.test.ts` | 11 | Layer per failure cause, lowest broken layer wins, legend |
| `lib/participants.test.ts` | 12 | Role mapping for generic and MOSIP product names, chronological order, replay slice |
| `lib/fallback.test.ts` | 4 | Plain-language emulation notice per phase |
| `lib/jsonHighlight.test.tsx` | 11 | Token kinds, exact text preserved, escaped quotes, primitives |
| `components/MatrixSelector.test.tsx` | 22 | Registry-driven radios and `aria-checked`, selection callbacks, locking while running, per-role status (table-driven `columnStatus`), verifier verdict, per-role Emulated badge |
| `components/FlowControls.test.tsx` | 35 | Action wiring, edited subject, tamper options (including "tamper mode on, nothing ticked" → no payload), scenarios, offer and OpenID4VP QR/deep links, clipboard, oversize-QR warning, W3C and SD-JWT summaries, verdict card with "Valid but Expired", URI builders, `activeTamper` |
| `components/flow/CredentialInspector.test.tsx` | 6 | Collapsed by default, W3C claims and proof, labelled SD-JWT parts, decoded disclosures with digest result, unavailable WebCrypto, undecodable token |
| `components/flow/SharedClaimsPanel.test.tsx` | 5 | Custody summary, minimal sharing, over-disclosure warning, missing claims, labelled groups |
| `components/RunTimeline.test.tsx` | 5 | Protocol order, role mapping for emulated services, status and tamper in text, current/not-yet steps |
| `components/RunPlayer.test.tsx` | 8 | Live state, stepping, slider, back to live, autoplay with fake timers, pause, reduced motion |
| `components/InteropMatrixReport.test.tsx` | 33 | Heatmap (cells, accessible names, combination filter), list view, UNTESTED coverage, latest clean run per combination, real vs emulated scores and warning, negative-path stats, filters including layer, batch progress, Markdown/JSON export with layers, confirm-before-clear, `scoreMatrix`, `toMarkdown` escaping |
| `components/Header.test.tsx` | 7 | Connecting / Online / Offline, view tabs and `aria-current`, run count |
| `components/SequenceDiagram.test.tsx` | 10 | (mermaid mocked) light token theme, placeholder, chronological arrows, participant mapping including emulated Inji Verify (F-1), tamper note, action sanitising, re-render, render error |
| `components/ProtocolInspector.test.tsx` | 9 | Empty state, list contents, default newest selection, switching logs, request tab, copy JSON, clear callback, request/response headers |
| `test/design.test.ts` | 41 | Design system: every token used, WCAG contrast for each text pairing (4.5:1) and for focus rings and icons (3:1), and a guardrail that fails on banned patterns (gradients, large/coloured shadows, pulses, wide tracking, blur, oversized radii, raw palette colours, `transition-all`, text under 12px). See [design-tokens.md](./design-tokens.md) |
| `App.test.tsx` | 15 | Whole app against a stubbed BFF (`fetch`): health states, issue → verify with one transaction ID, report recording clean and tampered runs, error and emulation banners, run-all, compact empty state, current-run vs all-runs scope, presets (tamper and matrix), replay, phone raw-message toggle |

Conventions:

- Query by role and accessible name (`getByRole('button', { name: /Run Full Flow/ })`), and drive interactions with `userEvent`.
- Use `src/test/fixtures.ts` (`makeRun`, `makeLog`) instead of hand-building records.
- Mock the network at the edge: the hook tests mock `api/client`, and the App tests stub `fetch`. Mermaid is always mocked, because jsdom can't lay out SVG.
- `src/test/setup.ts` works around Node ≥ 25 defining its own global `localStorage`, which otherwise hides jsdom's. It does nothing on older Node versions.

## Backend (`backend/tests/*.test.ts`)

Configured in `backend/vitest.config.ts`. Tests live outside `src/`, so `tsc` doesn't compile them into `dist/`.

| File | Tests | Covers |
| --- | --- | --- |
| `RingBuffer.test.ts` | 9 | Ordering, limits, eviction, per-transaction lookup and sort, clear, singleton capacity |
| `redactor.test.ts` | 16 | Every sensitive key (case-insensitive, nested, in arrays), VC artefacts kept verbatim, no input mutation |
| `auditInterceptor.test.ts` | 16 | Audit frame fields, sequence numbers, redaction, HTTP and network errors, protocol and format normalisation, tamper annotations (a local axios adapter, no network) |
| `mockService.test.ts` | 19 | Draft 13 offer, W3C and SD-JWT credentials (JWT segments decoded and checked), Draft 21 presentation definition, expired / signature / both negative paths, logs |
| `playground.routes.test.ts` | 18 | `/api/playground/*` over real HTTP on an ephemeral port, with axios mocked for Collab calls: mock and Inji paths, wire-format mapping, sandbox fallback, transaction IDs, logs, matrix-status, malformed JSON |
| `proxyGateway.test.ts` | 7 | Proxy against a local upstream server: forwarding, query strings, case-insensitive targets, redacted `_auditTrail`, error statuses |

### Known-bug tests (`it.fails`)

`it.fails` passes while the assertion fails. Each one pins a bug that is still open:

| Test | Bug | Owner |
| --- | --- | --- |
| `auditInterceptor` › logs form-urlencoded requests | `JSON.parse(config.data)` throws, so OpenID4VP `direct_post` calls through the audit client reject | Aatraya |
| `proxyGateway` › passes non-JSON upstream bodies through intact | Text bodies are object-spread into `{"0":"h",…}` | Aatraya |
| `playground.routes` › answers a request without a JSON body with a JSON 400 | `req.body` is undefined in Express 5, so the route returns 500 with an HTML stack trace | Aatraya |
| `playground.routes` › returns a credential offer for real Inji Certify issuance | Real Certify responses aren't normalised (no `credentialOffer`) | Aatraya |
| `playground.routes` › normalises real Inji Verify responses | No `isValid` / `checks` on real Verify responses | Aatraya |
| `RingBuffer` › never returns a frame twice | `getLogs(limit > capacity)` wraps and returns duplicates | Aatraya |
| `mockService` › does not leak tamper flags into the credential subject | `tamperPayload` is spread into `credentialSubject` | Aryan |
| `mockService` › does not flag all-false tamper options as tampered | Any tamper object sets `tampered: true` | Aryan |

**When you fix one,** the test turns red. Change `it.fails(` to `it(` and commit it with the fix. Details are in [known-issues.md](./known-issues.md).

## Protocol scenarios (`npm run test:interop`)

`backend/scripts/test-interop.ts` runs TC-01 to TC-05 against a live BFF at `BFF_URL` (default `http://localhost:4000`). If none is running, it calls the mock engine directly. It exits non-zero on any failure.

## Writing new tests

- Frontend: put `Thing.test.tsx` next to `Thing.tsx`. Backend: put it in `backend/tests/`.
- Keep tests offline: mock `fetch` or axios, or start a local server on port `0`.
- Run `npm --prefix frontend run test:watch` while developing.
- `npm run build` type-checks frontend tests too (they're in `src/`), so type errors in tests fail the build.
