# Known Issues & Interoperability Gaps

This is the running list of bugs and gaps found while building and testing the playground. Each bug has an automated test that pins it (see [testing.md](./testing.md#known-bug-tests-itfails)). Interoperability gaps are candidates to report upstream to the relevant `mosip/inji-*` repositories.

Last updated: 2026-10-25.

---

## Environment

### E-1 · Collab sandbox hostnames do not resolve (blocking)

- **Where:** `.env.example`, `docker-compose.yml`, `backend/src/routes/playground.ts`
- **What:** `certify.collab.mosip.net`, `verify.collab.mosip.net` and `mimoto.collab.mosip.net` fail DNS lookup (`ENOTFOUND`), so every Inji run falls back to emulated mock responses. `proxyGateway.js` uses a different set of defaults (`collab.mosip.io/...`).
- **Impact:** mandatory task 1 (a real Inji stack end to end) isn't met yet. Inji results in the report are flagged *emulated sandbox*.
- **Fix:** take the correct hostnames from the MOSIP Collab Environment Guide and use the same values for every route.

---

## Backend bugs

### B-1 · Audit client rejects form-urlencoded requests (high)

- **Where:** `backend/src/middleware/auditInterceptor.js` (`logFrame`)
- **What:** the request body is always `JSON.parse`d. For `application/x-www-form-urlencoded` bodies, such as OpenID4VP `direct_post` (`vp_token=…`), the parse throws inside the response interceptor, so the call rejects even when the server returned 200.
- **Fix:** parse only when the body is JSON, otherwise log the raw string (or parse it with `URLSearchParams`).

### B-2 · Proxy mangles non-JSON upstream bodies (medium)

- **Where:** `backend/src/routes/proxyGateway.js`
- **What:** `{ ...response.data, _auditTrail }` spreads string bodies into `{"0":"h","1":"e",…}`.
- **Fix:** attach the audit trail as a header, or wrap non-object bodies as `{ data, _auditTrail }`.

### B-3 · Missing JSON body returns a 500 HTML page (medium)

- **Where:** `backend/src/routes/playground.ts` (`/issue`, `/verify`)
- **What:** in Express 5, `req.body` is `undefined` without a JSON body. The destructuring happens before the `try`, so the client gets a 500 with an HTML stack trace.
- **Fix:** default `req.body ?? {}` and validate it, returning a JSON 400.

### B-4 · Real Inji responses are not normalised (medium)

- **Where:** `backend/src/routes/playground.ts`
- **What:** when the Collab calls succeed, the raw response is passed through. `/issue` then lacks `credentialOffer`, and `/verify` lacks `isValid` and `verificationResult.checks`. The UI's QR code, verdict card and report all rely on those fields.
- **Fix:** map Inji Certify and Inji Verify responses onto the mock engine's response shape.

### B-5 · `getLogs(limit)` returns duplicates when limit > capacity (low)

- **Where:** `backend/src/utils/RingBuffer.js`
- **What:** on a full buffer, the backwards walk wraps around and repeats frames. `/logs` uses 100 of 350, so the route isn't affected today.
- **Fix:** stop after `capacity` steps.

### B-6 · Tamper flags leak into the credential subject (medium)

- **Where:** `backend/src/mocks/mockService.ts` (`issueCredential`)
- **What:** `...(tamperPayload || {})` is spread into `credentialSubject`, so `forceExpired` appears as a claim. The frontend works around this by sending tamper options only at presentation time.
- **Fix:** don't merge `tamperPayload` into the subject.

### B-7 · All-false tamper payload counted as tampered (low)

- **Where:** `backend/src/mocks/mockService.ts` (`verifyPresentation`)
- **What:** `tampered` is set for any non-empty `tamperPayload` object, even `{ forceExpired: false, corruptSignature: false }`, so the diagram shows a tamper warning on a clean run. The frontend no longer sends such payloads.
- **Fix:** derive `tampered` from the individual flags.

### B-8 · Proxy gateway not mounted (low)

- **Where:** `backend/src/index.ts`
- **What:** `proxyGateway.js` is implemented and tested but never registered with the app, so `/api/proxy/*` returns 404.

---

## Interoperability gaps (candidates for upstream issues)

| ID | Gap | Observed in | Notes |
| --- | --- | --- | --- |
| G-1 | **QR capacity.** A by-value `openid-credential-offer` or `openid4vp://authorize` with a full presentation definition can exceed QR capacity (~2.9 KB at level L). | Playground QR panel | The UI warns and offers the deep link. Real flows should use `credential_offer_uri` / `request_uri` by reference. |
| G-2 | **mDoc / ISO 18013-5 not supported.** The audit logger coerces `mso_mdoc` to "W3C VC (JSON-LD)". | `auditInterceptor.js` `enforceCredentialFormat` | Needed for the good-to-have third format. Without it, mDoc traffic is mislabelled. |
| G-3 | **Presentation request fields.** The verifier doesn't return `nonce` / `client_id`, so the UI uses the transaction ID and the registry `client_id`. | `/verify` response | Wallets must bind the `vp_token` to the verifier's nonce. Needed for replay protection. |
| G-4 | **Proof type not reported by the issuer.** The UI infers it from `proof.type` (LD) or the JWT `alg`. | `/issue` response | Report columns depend on this inference. |

Once E-1 is fixed and real Collab traffic flows, re-run **Run All Combinations** and record any real Inji ↔ mock incompatibilities here.
