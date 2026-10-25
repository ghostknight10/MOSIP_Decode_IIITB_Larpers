# MOSIP VC Interoperability Playground — Comprehensive Technical Demo Script (3 to 5 Minutes)

This script provides an **in-depth, technically rigorous walkthrough** of the MOSIP VC Interoperability Playground. It covers every user interface option, protocol interaction, cryptographic verification check, and data minimization feature for the hackathon jury.

---

## Pre-Recording Checklist

1. **Start the Environment**: Ensure Docker or local dev servers are running:
   ```bash
   npm run dev:backend   # Terminal 1: BFF on port 4000
   npm run dev:frontend  # Terminal 2: Vite on port 5173
   ```
2. **Access the Playground**: Open `http://localhost:5173`.
3. **Verify Header Connectivity**: Confirm `BFF Proxy: Online (Collab/Mock)` appears in the top navigation bar.
4. **Clean Baseline**: Open the `Interop Matrix Report` tab $\rightarrow$ click `Clear History` to ensure the heatmap begins at `0 / 16`.
5. **Mobile Device**: Keep a smartphone camera or Inji wallet ready for Segment 3.

---

## Segment 1: The Problem & High-Level Architecture (0:00 – 0:45)

* **Visual**: Landing on the Playground view. Cursor pans across the Header, Environment connectivity status, and the 3-Column Matrix.
* **Technical Narration**:
  > "Digital identity credentials issued under sovereign frameworks often suffer from ecosystem fragmentation. A Verifiable Credential issued by one authority cannot always be parsed by independent wallets or verified by third-party Relying Parties due to differing protocol interpretations, signature suites, and payload wrappers.
  >
  > Our solution is the **MOSIP VC Interoperability Playground**—a protocol transparency workbench and automated certification harness. It exercises bi-directional interoperability between **MOSIP reference implementations**—Inji Certify, Inji Web/Mobile via Mimoto, and Inji Verify—and independent standard engines.
  >
  > Across the top, our registry-driven 3-column matrix lets developers configure any combination of:
  > * **Issuers:** MOSIP Inji Certify or standard OpenID4VCI Draft 13 Mock Issuer.
  > * **Wallets:** Inji Web/Mobile via Mimoto or our Simulated In-Browser Holder.
  > * **Verifiers:** MOSIP Inji Verify or standard OpenID4VP Draft 21 Mock Verifier.
  >
  > We support three key credential standards: **W3C VC (JSON-LD)** with `Ed25519Signature2020` proofs, **IETF SD-JWT** (`vc+sd-jwt`) with salted SHA-256 selective disclosures, and mobile driver licenses under **ISO 18013-5 (mDoc)**."

---

## Segment 2: Scenario Presets & OpenID4VCI Issuance Flow (0:45 – 1:50)

* **Visual**:
  1. Hover over the **Scenario Presets** bar (`TC-01` through `TC-05`).
  2. Click **`TC-02 Happy path · SD-JWT`**.
  3. Show how the matrix dynamically configures `Mock OpenID4VCI` $\rightarrow$ `Simulated Holder` $\rightarrow$ `Mock OpenID4VP` with `SD-JWT` selected.
  4. Expand the **Credential Subject Claims** drawer to highlight configurable fields (`fullName`, `nationalId`, `dob`, `country`).
  5. Click **Trigger "Issue Credential" Flow**.
  6. Point to the generated **Credential Offer QR**. Scan with your mobile phone camera to show the native `openid-credential-offer://` prompt on your phone screen.
* **Technical Narration**:
  > "Rather than tedious manual configuration, the playground provides one-click scenario presets mapping directly to our test cases. Let's trigger `TC-02 Happy Path · SD-JWT`.
  > The matrix instantly switches nodes, and the claims editor exposes the underlying identity attributes.
  >
  > Clicking **Trigger 'Issue Credential' Flow** initiates an OpenID4VCI Draft 13 exchange:
  > The client queries the issuer's discovery metadata at `/.well-known/openid-credential-issuer`, exchanges an OAuth pre-authorized code, and issues a cryptographic offer.
  > 
  > This QR code encodes the standard `openid-credential-offer://` scheme. Scanning it with our mobile phone camera immediately triggers the device's native OID4VCI provider handler, proving real-world mobile wallet compatibility."

---

## Segment 3: Deep Credential Inspection & Selective Disclosure Verification (1:50 – 2:45)

* **Visual**:
  1. Under the issued summary card, click the **Inspect Credential** button.
  2. Tab through **JOSE Header**, **Claims Payload**, **Signature**, and **Disclosures**.
  3. Focus on the **Disclosures** breakdown, showing individual salts, claim values, and the **"Digest in `_sd`"** green checkmarks.
  4. Point to the **Import Credential** feature on the wallet column (allowing external VCs to be loaded).
* **Technical Narration**:
  > "Next, we open **Inspect Credential**. Rather than treating the credential as an opaque string, our inspector disassembles the `vc+sd-jwt` structure:
  > * The **Header** displays the `ES256` algorithm and token type.
  > * The **Payload** reveals the issuer DID, expiration timestamp, and the blinded `_sd` array.
  > * The **Disclosures** tab decodes each individual salted claim.
  > 
  > Our inspector computes the SHA-256 hash of each base64url disclosure on the fly and confirms that its mathematical digest exists in the issuer's signed `_sd` array. This provides cryptographic proof that the claims originate from the trusted issuer without exposing private attributes."

---

## Segment 4: OpenID4VP Verification & "What Was Shared" Data Minimization (2:45 – 3:35)

* **Visual**:
  1. Click **Trigger "Present & Verify" Flow**.
  2. Show the green **VALID** status card with its 4 checks: `Format Valid`, `Signature Verified`, `Not Expired`, and `Schema Compliant`.
  3. Click and expand the **"What was shared"** data minimization panel.
  4. Trace the custody line from Issuer $\rightarrow$ Wallet $\rightarrow$ Verifier, highlighting:
     * *Claims Requested* by the Verifier.
     * *Claims Disclosed* by the Holder.
     * *Claims Kept Private* in the Wallet.
     * *Over-Disclosed Claims* (flagged if any extra claims leaked).
* **Technical Narration**:
  > "Now we execute presentation. The Verifier serves an OpenID4VP Draft 21 authorization request containing a cryptographic nonce and a `presentation_definition` specifying required input descriptors.
  > The wallet submits the `vp_token`. The Verifier validates key binding, checks revocation, and confirms schema compliance.
  >
  > Crucially, digital identity mandates **data minimization**. Our **'What was shared'** panel analyzes attribute custody across the entire lifecycle:
  > It highlights exactly which claims the Relying Party asked for, which were released, which were kept private, and flags any accidental over-disclosure. This gives developers complete auditability over privacy compliance."

---

## Segment 5: Live Protocol Wire Transparency & Step-by-Step Replay (3:35 – 4:20)

* **Visual**:
  1. Direct attention to the right-hand **Live Protocol View**.
  2. Show the **Step Timeline** highlighting all 4 transaction hops with millisecond latencies.
  3. In the **Run Player**, click **First step**, then click **Play**.
  4. Watch the scrubber advance step-by-step while the timeline, Mermaid sequence diagram, and wire inspector update in lockstep!
  5. Select **Step 2: POST /credential** in the inspector. Switch between **Request** and **Response** tabs showing HTTP headers (including `x-transaction-id` and redacted auth tokens) and formatted JSON bodies.
  6. Click **Copy JSON**.
* **Technical Narration**:
  > "On the right is our **Live Protocol View**, powered by real-time Server-Sent Events (SSE) and our high-throughput in-memory circular ring buffer.
  > Every request carries an `x-transaction-id` header to correlate multi-hop exchanges.
  >
  > Our built-in **Run Player** allows cryptographic replay: clicking Play steps through the transaction, synchronously updating the step timeline, re-rendering the dynamic Mermaid.js sequence diagram, and isolating the active wire packet.
  > In the inspector, developers can inspect HTTP request/response methods, latency, status codes, and headers, with one-click clipboard export for debugging."

---

## Segment 6: Chaos Mode & Negative Security Verification (4:20 – 4:55)

* **Visual**:
  1. Click preset **`TC-03 Expired credential`** (or enable **Tamper Mode** $\rightarrow$ check **Expire Timestamp**).
  2. Click **Run Full Flow**.
  3. Show the red **EXPIRED** verification card with badge: `Valid but Expired`.
  4. Next, click preset **`TC-04 Corrupted signature`** $\rightarrow$ click **Run Full Flow**.
  5. Show **SIGNATURE_MISMATCH** and point out the **`⚠️ Tampered Payload Detected!`** alert callout dynamically rendered in the Mermaid sequence diagram!
* **Technical Narration**:
  > "Interoperability also demands resilience against invalid or malicious data. In **Chaos Mode**, we inject synthetic wire anomalies:
  > * In `TC-03`, we expire the validity window. The verifier flags `EXPIRED`—recognizing that the cryptographic signature is intact, but temporal validity has lapsed (`Valid but Expired`).
  > * In `TC-04`, we tamper with a single byte in the cryptographic proof. The verifier immediately catches the tampering and returns `SIGNATURE_MISMATCH`.
  > Notice that our dynamic Mermaid visualizer flags the compromised hop in real time with a red alert callout: `⚠️ Tampered Payload Detected!`. Both tests count as passes because the security boundary held firm."

---

## Segment 7: 16-Combination Heatmap & Automated Certification (4:55 – 5:30)

* **Visual**:
  1. Click the **`Interop Matrix Report`** tab in the top navigation bar.
  2. Show the $4 \times 4$ Heatmap matrix ($2\text{ Issuers} \times 2\text{ Wallets}$ rows vs $2\text{ Verifiers} \times 2\text{ Formats}$ columns = 16 combinations).
  3. Click **Run All Combinations** and watch the batch progress bar (`16 / 16`) populate the heatmap in real time!
  4. Point to the separate **Real MOSIP Pass Rate** vs **Emulated Pass Rate** counters.
  5. Expand the **Failure Layers** legend (*Technical, Syntactical, Semantic, Organizational*).
  6. Click a heatmap cell to filter the execution history, then click **Export Markdown**.
* **Technical Narration**:
  > "Finally, we open the **Interop Matrix Report**.
  > Cross-ecosystem interoperability requires testing all 16 permutations across 2 Issuers, 2 Wallets, 2 Verifiers, and 2 Formats.
  > Clicking **Run All Combinations** triggers our automated batch runner.
  > 
  > The heatmap provides honest, scientific reporting:
  > * Real MOSIP Collab Sandbox runs are scored strictly separately from emulated fallbacks.
  > * Any failure is categorized under Schumm et al.'s five interoperability layers: Technical transport, Syntactical formatting, Semantic schemas, or Organizational policies.
  >
  > Clicking **Export Markdown** produces a comprehensive, auditable interoperability scorecard ready for submission."

---

## Segment 8: Conclusion (5:30 – 5:45)

* **Visual**: Brief switch to terminal running `npm test` and `docker compose up`.
* **Technical Narration**:
  > "The entire monorepo runs with a single command via Docker Compose on Node 26 Alpine and is verified by over 420 automated unit, component, and protocol tests in GitHub Actions CI.
  > The MOSIP VC Interoperability Playground demonstrates that digital identity can achieve cross-vendor, standards-compliant interoperability with complete wire transparency. Thank you."
