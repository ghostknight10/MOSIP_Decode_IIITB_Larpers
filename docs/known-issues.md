# Known Issues & Interoperability Gaps

This is the running list of open problems and of interoperability gaps found while testing against the MOSIP Collab sandbox. Interoperability gaps are candidates to report upstream to the relevant `mosip/inji-*` repositories. Fixed items are listed at the end.

Last updated: 2026-10-25.

---

## What runs live today

| Service | Collab endpoint | Live calls | Emulated |
| --- | --- | --- | --- |
| Inji Certify | `https://injicertify-mosipid.collab.mosip.net` | Issuer metadata; credential request (refused without a token) | The credential itself (E-1) |
| Mimoto (Inji wallet backend) | `https://api.collab.mosip.net/v1/mimoto` | Issuer registry lookup when **Inji Web / Mobile** is selected | Credential download and presentation (E-2) |
| Inji Verify | `https://injiverify.collab.mosip.net` | `POST /v1/verify/vc-verification` with the credential (tampered for real in tamper mode) | Nothing, unless the service is unreachable |

Live steps carry a **Live** chip in the inspector. When a Collab service can't be reached or answers without JSON, the BFF falls back to the mock engine and says why in the banner above the workflow.

---

## Open

### E-1 · Inji Certify issuance needs an eSignet user login (high, Aatraya)

- **What:** Certify's `credential_endpoint` needs an access token from eSignet (`authorization_servers: esignet-mosipid.collab.mosip.net`), which is obtained through a user login with OTP. Without one, Certify answers 403 and the playground emulates the credential.
- **Impact:** an Inji Certify credential is never verified end to end. Mandatory task 1 is met only up to the credential request.
- **Next step:** get a Collab test identity (UIN plus OTP) and an OIDC client registered with eSignet, then run the authorization-code flow once to fetch a real `ldp_vc`. Store that credential as a fixture and verify it against Inji Verify and the mock verifier.

### E-2 · Wallet steps through Mimoto stop at the registry (medium, Aatraya)

- **What:** with **Inji Web / Mobile** selected, the BFF looks up the issuer in Mimoto's registry (live). Downloading and presenting through Mimoto needs the same eSignet login as E-1.
- **Next step:** after E-1, call Mimoto's token and credential-download endpoints for the Inji wallet path.

### M-1 · Mock-issued credentials are not really signed (high, Aryan)

- **What:** the mock issuer's `proofValue` and SD-JWT signature are placeholders. Inji Verify verifies signatures for real, so it rejects every mock-issued credential with `INVALID`. Clean runs ending at Inji Verify are therefore recorded as **FAIL** (Technical layer).
- **Why it matters:** this is a genuine result, not a playground bug, but it means mock ↔ Inji Verify interoperability can't pass yet.
- **Next step:** sign mock credentials with a real key, for example `Ed25519Signature2020` with a `did:key` or `did:jwk` issuer that Inji Verify can resolve, and ES256 for SD-JWT.

### S-1 · Presentation nonce is not bound (medium, Aryan)

- **What:** `/verify` returns a fresh `nonce`, but the request and the presentation arrive in the same call, so the verifier cannot check that the `vp_token` is bound to it. Replay protection is not exercised.
- **Next step:** split OpenID4VP into an authorization request (returns `nonce`) and a `direct_post` response that must carry it.

### S-2 · The BFF has no authentication (low, deployment)

- **What:** anyone who can reach the BFF can run flows, read and clear the audit log, and use `/api/proxy/*` to call the Inji services. The proxy forwards only an allowlist of headers and the Collab hosts are fixed, so it can't be pointed elsewhere.
- **Next step:** for a public demo, put the BFF behind the frontend only (don't publish port 4000), or add a shared token.

### G-1 · QR capacity (low)

A by-value `openid-credential-offer` or `openid4vp://authorize` with a full presentation definition can exceed QR capacity (~2.9 KB at level L). The UI warns and offers the deep link. Real flows should use `credential_offer_uri` / `request_uri` by reference.

### G-2 · mDoc / ISO 18013-5 not supported (low)

The audit logger coerces `mso_mdoc` to "W3C VC (JSON-LD)", and `/issue` accepts only `w3c-vc` and `sd-jwt`. Needed for the good-to-have third format.

---

## Interoperability findings from the live sandbox

Observed on 2026-10-25. These are candidates for upstream issues.

| ID | Finding | Evidence | Upstream |
| --- | --- | --- | --- |
| G-3 | **Mimoto points at a well-known URL Certify doesn't serve.** Mimoto's registry entry `Mosip` has `wellknown_endpoint: …/v1/certify/issuance/.well-known/openid-credential-issuer`, which returns 404. Certify serves metadata at `/v1/certify/.well-known/openid-credential-issuer` and `/.well-known/openid-credential-issuer`. | `GET api.collab.mosip.net/v1/mimoto/issuers/Mosip` | `mosip/mimoto` config |
| G-4 | **Missing token gives 403, not 401.** A credential request without an access token gets `403 Forbidden` with no `WWW-Authenticate` header. OpenID4VCI and RFC 6750 expect `401` with `error="invalid_token"`, which wallets use to start (or retry) authorization. | Live step "Credential request (no access token)" | `mosip/inji-certify` |
| G-5 | **No SD-JWT from this Certify instance.** `injicertify-mosipid` offers one configuration, `MOSIPVerifiableCredential` (`ldp_vc`). SD-JWT can't be issued by real Certify here. | Live issuer metadata | Collab config |
| G-6 | **Claim names differ.** Certify's credential uses `UIN`, `fullName`, `dateOfBirth`; the playground's presentation definition asks for `fullName` and `nationalId`. A real Inji credential would leave `nationalId` unshared. | Issuer metadata `credential_metadata.claims` | Playground (align the definition once E-1 gives a real credential) |
| G-7 | **Inji Verify reports one overall status.** `/vc-verification` returns only `verificationStatus` (`SUCCESS`, `EXPIRED`, `INVALID`), so the playground infers the individual checks. | Live verdicts | `mosip/inji-verify` (feature request) |

---

## Fixed

| ID | Was | Fixed in |
| --- | --- | --- |
| E-1 (old) | Collab hostnames `certify.` / `verify.collab.mosip.net` didn't resolve and the endpoints didn't exist, so every Inji run was emulated | `feat(bff): live MOSIP Collab traffic` |
| B-1 | Audit client threw on form-urlencoded bodies | Aatraya, `1ec4fd0` |
| B-2 | Proxy spread string bodies into `{"0":"h",…}` | Aatraya, `1ec4fd0` |
| B-3 | Missing JSON body gave a 500 HTML page | Aatraya, `7dc6662`; full validation in `fix(bff): harden` |
| B-4 | Real Inji responses not normalised | Aatraya, `7dc6662`; replaced by the live Collab client |
| B-5 | `getLogs(limit > capacity)` returned duplicates | Aatraya, `1ec4fd0` |
| B-6, B-7 | Tamper flags leaked into the subject; all-false tamper counted as tampered | Aryan, `d8430c2` |
| B-8 | Proxy gateway not mounted | Aatraya, `1ec4fd0` |
| B-9 | Fallback relabelled the wrong participant | `d8430c2` |
| B-10 | Proxy forwarded the caller's `Content-Length` with a re-serialised body, so non-canonical JSON hung the upstream call; it also forwarded cookies | `fix(bff): harden` |
| B-11 | SSE warned of a listener leak after ten clients; no heartbeat | `fix(bff): harden` |
| B-12 | Mock verifier accepted forged SD-JWT disclosures, crashed on a key-binding JWT, and returned VALID with sample claims when nothing was presented | `fix(mock): verifier checks SD-JWT disclosures` |
| B-13 | Redactor kept OpenID4VCI grant secrets (`pre-authorized_code`, `tx_code`) and secrets nested inside VC artefacts | `fix(bff): harden` |
| D-1 | `docker compose` frontend proxied `/api` to its own container (`VITE_BFF_URL=http://localhost:4000`) | `fix(devops)` |
| F-1 | Sequence diagram self-arrow for emulated Inji Verify | Ayaan, `42ba157` |
| F-2 | Inspector `scrollIntoView` jumped the page to the oldest entry; diagram interleaved runs | `fix(ui): stable diagram order` |
| F-3 | Dark gradient body, sky focus ring (below 3:1) and pulse animation reintroduced | `fix(ui): restore light theme tokens` |
| G-3…G-6 (old) | Verifier `nonce`/`client_id`, proof type, mock `_sd` digests, over-disclosure | Aryan, `d8430c2` |
