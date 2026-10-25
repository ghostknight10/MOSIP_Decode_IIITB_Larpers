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

### E-2 · The wallet role is never exercised (high)

- **Where:** `backend/src/routes/playground.ts`
- **What:** no route calls Mimoto or Inji Web. Choosing **Inji Web / Mobile** versus **Simulated Holder** changes the labels, not the traffic, so wallet interoperability is not actually tested yet.
- **Fix:** route the holder steps through Mimoto (credential download and presentation) when the Inji wallet is selected, once E-1 is resolved.

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

### B-8 · Proxy gateway not mounted (low)

- **Where:** `backend/src/index.ts`
- **What:** `proxyGateway.js` is implemented and tested but never registered with the app, so `/api/proxy/*` returns 404.

---

---

## Frontend bugs

### F-1 · Sequence diagram draws a self-arrow for emulated Inji Verify (medium, Ayaan)

- **Where:** `frontend/src/components/SequenceDiagram.tsx`
- **What:** participants are matched with `includes('verifier')`. The sender "Inji Verify (Collab Sandbox Emulated)" doesn't match, so it defaults to Wallet and step 3 is drawn Wallet → Wallet. The step timeline uses `lib/participants.participantOf`, which handles product names.
- **Fix:** reuse `participantOf`. Also set `mirrorActors: false`, drop the unused `User` actor, and enable `sequence.wrap` to stop labels overlapping lifelines.

---

## Interoperability gaps (candidates for upstream issues)

| ID | Gap | Observed in | Notes |
| --- | --- | --- | --- |
| G-1 | **QR capacity.** A by-value `openid-credential-offer` or `openid4vp://authorize` with a full presentation definition can exceed QR capacity (~2.9 KB at level L). | Playground QR panel | The UI warns and offers the deep link. Real flows should use `credential_offer_uri` / `request_uri` by reference. |
| G-2 | **mDoc / ISO 18013-5 not supported.** The audit logger coerces `mso_mdoc` to "W3C VC (JSON-LD)". | `auditInterceptor.js` `enforceCredentialFormat` | Needed for the good-to-have third format. Without it, mDoc traffic is mislabelled. |
Once E-1 is fixed and real Collab traffic flows, re-run **Run All Combinations** and record any real Inji ↔ mock incompatibilities here.
