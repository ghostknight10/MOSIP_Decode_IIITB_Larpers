# MOSIP VC Interoperability Playground — Manual Test Cases

These scenarios validate cross-ecosystem interoperability and protocol conformance through the UI. Test identities and sample credentials are in [test-data.md](./test-data.md); results of a live run of every combination are in [interop-report.md](./interop-report.md). They mirror the automated `npm run test:interop` suite (TC-01 to TC-05), and the same behaviour is covered by the unit and component tests described in [testing.md](./testing.md).

**Setup:** run `docker compose up --build` (or `npm run dev:backend` + `npm run dev:frontend`) and open <http://localhost:5173>. The header should show **BFF: Online (Collab/Mock)**.

**Shortcut:** each test case below has a **Quick scenario** button (TC-01, TC-02, TC-03, TC-04, TC-05a, TC-05b, TC-07, TC-08) that selects the nodes, sets the tamper options and runs the full flow. The manual steps remain the reference.

**Reading results:**

- The verdict card shows the verifier status (`VALID`, `INVALID`, `EXPIRED`, `SIGNATURE_MISMATCH`) and the four checks.
- Every run is recorded in **Interop Matrix Report → Run History**. **PASS** means the verifier behaved as expected: it accepted a clean credential, or rejected a tampered one.
- Inji nodes showing **Emulated** were answered by the mock engine; the banner says why (Collab unreachable, or Inji Certify needing a user login). Steps with a **Live** chip in the inspector were real Collab traffic. Record both alongside the result.
- **Inji Verify verifies for real.** The mock issuer signs for real, so clean W3C and SD-JWT credentials pass live Inji Verify, and expired or corrupted ones are rejected. Inji Verify checks a credential, not a presentation, so **wrong type** and **replay** attacks are accepted by it and recorded as FAIL (G-8). Its service has no mDoc support (G-10), so that format is disabled for it.

---

## TC-01: Happy path W3C VC issuance & verification

- **Objective:** end-to-end issuance and verification of a W3C Linked Data Proof (JSON-LD) credential.
- **Nodes:** Issuer `Inji Certify` (or `Mock OpenID4VCI`) · Wallet `Inji Web / Mobile` (or `Simulated Holder`) · Verifier `Inji Verify` (or `Mock OpenID4VP`) · Format `W3C VC (JSON-LD) ldp_vc`
- **Steps:**
  1. Select the nodes in the 3-column matrix.
  2. Click **Trigger "Issue Credential" Flow**.
  3. Confirm the **Credential Offer** QR appears (scanning it yields an `openid-credential-offer://` URI), the issuer badge shows **Done** and the wallet badge shows **Holding VC**.
  4. Confirm the credential summary shows format `ldp_vc` and proof `Ed25519Signature2020`.
  5. Click **Trigger "Present & Verify" Flow**.
- **Expected result (mock nodes):**
  - The verdict is `VALID` and all four checks are green. The verifier badge shows `VALID`.
  - The Authorization Request QR (`openid4vp://authorize?…`) is shown.
  - The Protocol Inspector lists **4** frames for the run (newest first): `POST /vp-response`, `openid4vp://authorize`, `POST /credential`, `GET /.well-known/openid-credential-issuer`.
  - The sequence diagram draws them in order with an `OpenID4VCI` and an `OpenID4VP` phase note, and the replay controls step through them.
  - **What was shared** lists exactly `fullName` and `nationalId`.
  - Run History records a **PASS** row.
- **Expected result (all Inji, with `COLLAB_TEST_INDIVIDUAL_ID=8267411578`):** the real Inji stack end to end.
  - Eight **Live** steps: eSignet `oauth-details`, OTP, authenticate, authorization code, `Token request (via Mimoto)`, `Nonce request`, `Credential request (/credential)` and `Verify credential (/v2/vc-verification)`.
  - A real `LandStatementCredential` from `did:web:injicertify-landregistry.collab.mosip.net`. Inji Verify returns `VALID` with no **Emulated** badges, and Run History records **PASS**.
  - **What was shared** shows the requested `fullName` / `nationalId` as not shared: a land statement carries neither.
- **Expected result (all Inji, without a test identity):**
  - The inspector shows **Live** steps: `Fetch issuer metadata`, `Look up issuer in Mimoto registry`, `Credential request (no access token)` (Failed, HTTP 403), then the emulated `Credential Request (/credential)` and the live `Verify credential (/v2/vc-verification)`.
  - The banner says Inji Certify answered live but needs an eSignet access token, so the credential is emulated (signed by the mock issuer).
  - Inji Verify returns `VALID` with its individual checks (schema and signature, expiry, status), and Run History records **PASS** marked † (emulated issuer).

---

## TC-02: Happy path SD-JWT VC issuance & verification

- **Objective:** IETF Selective Disclosure JWT VC lifecycle with salted disclosures.
- **Nodes:** Issuer `Mock OpenID4VCI` · Wallet `Inji Web / Mobile` · Verifier `Mock OpenID4VP` · Format `SD-JWT VC vc+sd-jwt`
- **Steps:**
  1. Toggle the format to **SD-JWT VC**.
  2. Click **Run Full Flow**.
- **Expected result:**
  - The credential summary shows proof `JWT (ES256)` and a selective disclosure count. In the inspector, the raw token is `header.payload.signature~disclosure~`.
  - The verdict is `VALID`, and the run is **PASS** with format `SD-JWT VC`.
  - **Inspect credential** splits the token into header, payload, signature and disclosures. Every disclosure shows "Digest in _sd: Yes".

---

## TC-03: Negative test — expired credential presentation

- **Objective:** the verifier detects and rejects expired credentials.
- **Steps:**
  1. Click **Enable Tamper Mode** (it changes to **Tamper mode: on**).
  2. Tick **Expire Timestamp (Negative Path)**.
  3. Click **Run Full Flow**. Tamper options apply when the wallet presents, so issuance itself is clean.
- **Expected result:**
  - The verdict is `EXPIRED`, labelled **Valid but Expired** (the signature check stays green and the **Not expired** check is red).
  - The details read `Credential expiration check failed: validity period exceeded.`
  - The verifier badge shows `EXPIRED`.
  - Run History records the run as **tampered** with outcome **PASS** (correct rejection).

---

## TC-04: Negative test — corrupted cryptographic signature

- **Objective:** the integrity check fails when the proof signature has been modified.
- **Steps:**
  1. Enable **Tamper Mode** and tick **Corrupt Cryptographic Signature** only.
  2. Issue a credential, then click **Trigger "Present & Verify" Flow**.
- **Expected result:**
  - The verdict is `SIGNATURE_MISMATCH` and the **Signature** check is red.
  - The sequence diagram annotates the submission step with `⚠️ Tampered Payload Detected!`.
  - Run History records a tampered **PASS**.
- **Control:** with tamper mode on but **no** attack ticked, the run is treated as clean (`VALID`, no tamper note).

---

## TC-05: Cross-ecosystem matrix

- **Objective:** interoperability across heterogeneous implementations, in both directions.
- **Spot checks:**
  - Combination A: `Mock OpenID4VCI` → `Inji Web / Mobile` → `Inji Verify`: a live `VALID` from Inji Verify, **PASS**.
  - Combination B: `Inji Certify` → `Simulated Holder` → `Mock OpenID4VP`
- **Full matrix:**
  1. Open **Interop Matrix Report** and click **Run All Combinations**. The button shows progress (`Running n/20…`).
  2. When it finishes, check **Combinations Tested** reads **20 / 20**. The four Inji Verify × mDoc cells read **Not supported**.
  3. Click **Markdown** to export the report.
- **Expected result:**
  - The heatmap has an outcome in every cell. Scores are shown separately for **Real** and **Emulated** runs; cells marked † did not reach the real Collab services.
  - Any FAIL cell shows its failure layer (TECH / SYN / SEM / ORG). Selecting a cell filters Run History to that combination.
  - The exported Markdown contains the matrix table and the full run history (the submission's interoperability report).

---

## TC-06: Re-present a held credential to a different verifier

- **Objective:** the same issued credential is accepted by both verifiers.
- **Steps:**
  1. Issue a credential (any issuer and format), then present to **Inji Verify**.
  2. Switch the verifier column to **Mock OpenID4VP**. The wallet keeps **Holding VC** and the transaction ID stays the same.
  3. Click **Trigger "Present & Verify" Flow** again.
- **Expected result:** both verifications are `VALID`, and Run History shows two PASS rows with the same transaction ID and different verifiers.
- **Contrast:** changing the issuer, wallet or format instead resets the run (all badges return to **Standby**).

---

## TC-07: mDoc (ISO 18013-5) presentation

- **Objective:** issue and present the third format, with selective disclosure and device binding.
- **Nodes:** `Mock OpenID4VCI` → `Inji Web / Mobile` (or `Simulated Holder`) → `Mock OpenID4VP` · Format `mDoc (ISO 18013-5) mso_mdoc` (preset **TC-07**).
- **Steps:** run the preset, then open **Inspect credential**.
- **Expected result:**
  - The inspector shows the docType `org.mosip.playground.nationalid.1`, validity dates and the data elements; the proof type is `COSE_Sign1 (ES256)`.
  - The verdict is `VALID` with **Holder binding** green. **What was shared** lists exactly `fullName` and `nationalId`; the other elements stay in the wallet.
  - With **Inji Verify** selected, the mDoc format is disabled (Inji Verify's service accepts no mDoc, G-10).

---

## TC-08: Replayed presentation

- **Objective:** the verifier rejects a presentation made for an earlier request (nonce binding, replay protection).
- **Steps:** run any flow once, then run preset **TC-08** (or tick **Replay an Earlier Presentation** in tamper mode) with **Mock OpenID4VP**.
- **Expected result:** `INVALID`, with **Holder binding** red and a message that the nonce does not match. Run History records a tampered **PASS** with layer TECH. Against Inji Verify, the same attack is accepted (it has no nonce) and recorded as FAIL (G-8).

---

## TC-09: A credential from outside the playground

- **Objective:** verify a real credential obtained from Inji (E-1), end to end.
- **Steps:**
  1. Get a credential from Inji, for example from Inji Web (`injiweb.collab.mosip.net`) after signing in with eSignet, as JSON, an SD-JWT or a base64url mDoc.
  2. In Phase 1, open **Use a credential from outside the playground**, paste it and click **Hold this credential**. The format switches to match.
  3. Choose **Inji Verify** (or the mock verifier) and click **Trigger "Present & Verify" Flow**.
- **Expected result:** Inji Verify returns its live verdict. Run History marks the run "(imported credential)". The mock verifier rejects it as not in its trust list, which is correct: it only trusts the mock issuer.

