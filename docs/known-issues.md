# Known Issues & Interoperability Gaps

This is the running list of open problems, and of the interoperability findings from testing against the MOSIP Collab sandbox. Drafts for reporting the upstream findings are in [upstream-issues.md](./upstream-issues.md). Fixed items are listed at the end.

Last updated: 2026-10-25.

---

## What runs live today

| Service | Collab endpoint | Live calls | Emulated |
| --- | --- | --- | --- |
| Inji Certify | `https://injicertify-mosipid.collab.mosip.net` | Issuer metadata; the credential request (refused without a token) | The credential itself (E-1). Or import a real one (below). |
| Mimoto (Inji wallet backend) | `https://api.collab.mosip.net/v1/mimoto` | Issuer registry lookup when **Inji Web / Mobile** is selected | Download and presentation through Mimoto (E-2) |
| Inji Verify | `https://injiverify.collab.mosip.net` | `POST /v1/verify/v2/vc-verification` (v1 as a fallback), with the credential tampered for real in tamper mode | Nothing, unless the service is unreachable |

- **Live steps** carry a **Live** chip in the inspector. If a Collab service can't be reached, or answers without JSON, the BFF falls back to the mock engine and the banner says why.
- **Mock credentials verify on Inji Verify.** The mock issuer signs for real: Ed25519Signature2020 with `did:key` for W3C, and ES256 with an `x5c` certificate for SD-JWT. Live Inji Verify accepts clean W3C and SD-JWT credentials, and rejects expired or re-signed ones.

---

## Open

### E-1 · Inji Certify issuance needs an eSignet user login (high)

- **What:** Certify's `credential_endpoint` needs an access token from eSignet (`esignet-mosipid.collab.mosip.net`), obtained through a citizen login. Without one, Certify answers 403 and the playground emulates the credential.
- **What works today:**
  - Get a credential from Inji yourself (for example with Inji Web after signing in), then paste it under **Phase 1 → Use a credential from outside the playground**.
  - The wallet holds it and presents it to Inji Verify or the mock verifier, so a real Inji credential can be tested end to end.
  - Runs are flagged "(imported credential)".
- **Automating it:** the mock identity system on Collab (`api.collab.mosip.net/v1/mock-identity-system/identity`) would let us create a test identity and log in through eSignet's API. That writes data to a shared sandbox, so it needs the team's go-ahead first.

### E-2 · Wallet steps through Mimoto stop at the registry (medium)

With **Inji Web / Mobile** selected, the BFF looks up the issuer in Mimoto's registry (live). Downloading and presenting through Mimoto need the same login as E-1.

### S-2 · The BFF is open unless `PLAYGROUND_TOKEN` is set (low, deployment)

- **What:** without a token, anyone who can reach the BFF can run flows, read and clear the audit log, and use `/api/proxy/*`.
- **Mitigation:** set `PLAYGROUND_TOKEN`. The BFF then answers only requests carrying it, which the Vite proxy adds server-side.
- **Already limited:**
  - The proxy forwards only an allowlist of headers.
  - Collab hosts are fixed.
  - The JSON-LD loader never fetches URLs taken from a credential.

### M-2 · mDoc presentation uses a simplified session transcript (low)

The OpenID4VP handover is `[sha256(client_id), sha256(response_uri), nonce]`, without the mdoc-generated nonce of ISO 18013-7 Annex B. It binds the presentation to the request, but other ISO 18013-7 implementations would compute a different transcript.

---

## Interoperability findings from the live sandbox

Observed on 2026-10-25. Report drafts are in [upstream-issues.md](./upstream-issues.md).

| ID | Finding | Upstream |
| --- | --- | --- |
| G-3 | Mimoto's registry points every issuer at `…/v1/certify/issuance/.well-known/openid-credential-issuer`, which returns 404 on Certify. | `inji/mimoto` config (U-1) |
| G-4 | A credential request without a token gets 403 with no `WWW-Authenticate`. OpenID4VCI and RFC 6750 expect 401 `invalid_token`. | `inji/inji-certify` (U-2) |
| G-5 | `injicertify-mosipid` offers only `ldp_vc` (`MOSIPVerifiableCredential`); no SD-JWT or mDoc. | Collab config |
| G-6 | Real MOSIP ID credentials use `UIN` / `dateOfBirth`. The presentation definition accepts `UIN` for `nationalId`. | Handled in the playground |
| G-8 | `/vc-verification` doesn't check credential type, nonce or holder binding. That is expected for a credential (not presentation) API, but wrong-type and replay negative tests against Inji Verify are recorded as FAIL. | By design; noted |
| G-9 | **No issuer trust check.** Inji Verify accepts any `did:key` issuer and any self-signed `x5c` certificate; mDoc `verifyCertificateChain` is a TODO. | `inji/vc-verifier` (U-4, report privately) |
| G-10 | Inji Verify's service routes only LDP, SD-JWT and CWT, so mDoc can't be verified, although `vc-verifier` supports it. Inji Verify × mDoc cells read **Not supported**. | `inji/inji-verify` (U-3) |

---

## Fixed

| ID | Was | Fixed in |
| --- | --- | --- |
| M-1 | Mock credentials had placeholder signatures, so Inji Verify rejected all of them | `feat(mock): real signatures…` |
| S-1 | The presentation nonce was not bound or checked; replay was not exercised | `feat(mock): real signatures, nonce-bound presentations…` (+ the "Replay an earlier presentation" tamper option, TC-08) |
| G-1 | Large offers or presentation definitions overflowed the QR code | `feat: pass large offers… by reference` |
| G-2 | mDoc not supported; the audit logger mislabelled `mso_mdoc` | `feat: mDoc (ISO 18013-5)…` |
| G-7 | Inji Verify gave one overall status, so checks were guessed | `feat: … Inji Verify v2 with real checks` |
| — | Proxy audit frames and playground logs had two shapes | `feat(audit): proxy audit frames also carry ProtocolLog fields` |
| E-1 (old) | Collab hostnames `certify.` / `verify.collab.mosip.net` didn't resolve, so every Inji run was emulated | `feat(bff): live MOSIP Collab traffic` |
| B-1 | Audit client threw on form-urlencoded bodies | Aatraya, `1ec4fd0` |
| B-2 | Proxy spread string bodies into `{"0":"h",…}` | Aatraya, `1ec4fd0` |
| B-3 | A missing JSON body gave a 500 HTML page | Aatraya, `7dc6662`; full validation in `fix(bff): harden` |
| B-4 | Real Inji responses were not normalised | Aatraya, `7dc6662`; replaced by the live Collab client |
| B-5 | `getLogs(limit > capacity)` returned duplicates | Aatraya, `1ec4fd0` |
| B-6, B-7 | Tamper flags leaked into the subject; an all-false tamper payload counted as tampered | Aryan, `d8430c2` |
| B-8 | Proxy gateway not mounted | Aatraya, `1ec4fd0` |
| B-9 | Fallback relabelled the wrong participant | `d8430c2` |
| B-10 | Proxy forwarded the caller's `Content-Length` with a re-serialised body (hang) and forwarded cookies | `fix(bff): harden` |
| B-11 | SSE warned of a listener leak after ten clients; no heartbeat | `fix(bff): harden` |
| B-12 | Mock verifier accepted forged SD-JWT disclosures, crashed on a key-binding JWT, and returned VALID for an empty presentation | `fix(mock): verifier checks SD-JWT disclosures` |
| B-13 | Redactor kept OpenID4VCI grant secrets and secrets nested in VC artefacts | `fix(bff): harden` |
| D-1 | `docker compose` frontend proxied `/api` to its own container | `fix(devops)` |
| F-1 | Sequence diagram self-arrow for emulated Inji Verify | Ayaan, `42ba157` |
| F-2 | Inspector `scrollIntoView` jumped the page; diagram interleaved runs | `fix(ui): stable diagram order` |
| F-3 | Dark gradient body, sky focus ring and pulse animation reintroduced | `fix(ui): restore light theme tokens` |
| G-3…G-6 (old) | Verifier `nonce`/`client_id`, proof type, mock `_sd` digests, over-disclosure | Aryan, `d8430c2` |
