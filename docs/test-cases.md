# MOSIP VC Interoperability Playground — Manual Test Cases

These scenarios validate cross-ecosystem interoperability and protocol conformance through the UI. They mirror the automated `npm run test:interop` suite (TC-01 to TC-05), and the same behaviour is covered by the unit and component tests described in [testing.md](./testing.md).

**Setup:** run `docker compose up --build` (or `npm run dev:backend` + `npm run dev:frontend`) and open <http://localhost:5173>. The header should show **BFF Proxy: Online (Collab/Mock)**.

**Shortcut:** each test case below has a **Quick scenario** button (TC-01, TC-02, TC-03, TC-04, TC-05a, TC-05b) that selects the nodes, sets the tamper options and runs the full flow. The manual steps remain the reference.

**Reading results:**

- The verdict card shows the verifier status (`VALID`, `INVALID`, `EXPIRED`, `SIGNATURE_MISMATCH`) and the four checks.
- Every run is recorded in **Interop Matrix Report → Run History**. **PASS** means the verifier behaved as expected: it accepted a clean credential, or rejected a tampered one.
- Inji nodes showing **Emulated** mean the Collab sandbox was unreachable and the BFF answered from the mock engine. Record that alongside the result.

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
- **Expected result:**
  - The verdict is `VALID` and all four checks are green. The verifier badge shows `VALID`.
  - The Authorization Request QR (`openid4vp://authorize?…`) is shown.
  - The Protocol Inspector lists **4** frames for the run (newest first): `POST /vp-response`, `openid4vp://authorize`, `POST /credential`, `GET /.well-known/openid-credential-issuer`.
  - The sequence diagram draws them in chronological order, and the replay controls step through them.
  - **What was shared** lists `fullName` and `nationalId` as requested. With the current mock, it also lists over-shared claims (G-6 in [known-issues.md](./known-issues.md)).
  - Run History records a **PASS** row.

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
  - **Inspect credential** splits the token into header, payload, signature and disclosures. With the current mock, "Digest in _sd" reads **No** (G-5 in [known-issues.md](./known-issues.md)).

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
  - Combination A: `Mock OpenID4VCI` → `Inji Web / Mobile` → `Inji Verify`
  - Combination B: `Inji Certify` → `Simulated Holder` → `Mock OpenID4VP`
- **Full matrix:**
  1. Open **Interop Matrix Report** and click **Run All Combinations**. The button shows progress (`Running n/16…`).
  2. When it finishes, check **Combinations Tested** reads **16 / 16**.
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
