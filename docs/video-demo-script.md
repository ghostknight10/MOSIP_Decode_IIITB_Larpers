# MOSIP Interoperability Playground — Video Demo Pitch Script (3 to 5 Minutes)

This script outlines the video demonstration for the hackathon evaluation, covering the project's background, live matrix execution, wire inspector, and cross-ecosystem certification.

---

### Segment 1: The Problem & The Solution (0:00 – 0:45)
* **Visual:** Pitch deck slide / Playground landing screen with top navbar and 3-column matrix.
* **Speaker:**
  > "Welcome. Digital identity ecosystems frequently suffer from fragmentation—where credentials issued under one sovereign authority cannot be seamlessly received by independent wallets or verified by third-party relying parties.
  > To solve this, our team has engineered the **MOSIP VC Interoperability Playground**—a comprehensive testbed and protocol transparency engine. It validates bi-directional compatibility between MOSIP reference implementations—Inji Certify, Inji Wallet, and Inji Verify—and independent OpenID4VCI and OpenID4VP standard endpoints across both W3C VC and SD-JWT formats."

---

### Segment 2: The 3-Column Matrix & Dual Spec Support (0:45 – 1:45)
* **Visual:** Cursor moves across the 3 columns: Issuer, Identity Wallet, and Verifier.
* **Speaker:**
  > "Our user interface is anchored by an interactive 3-column matrix selector.
  > In Column 1, we choose our Issuer—either MOSIP Inji Certify connected to the Collab Sandbox, or our custom OpenID4VCI Draft-13 Mock Issuer.
  > In Column 2, we select our Identity Wallet—Inji Web/Mobile via Mimoto, or our simulated browser holder.
  > In Column 3, we select our Verifier—Inji Verify or our OpenID4VP Draft-21 Verifier.
  > With one click at the top, we toggle between credential formats: standard W3C Linked Data Proofs, or high-privacy IETF SD-JWT with selective disclosure."

---

### Segment 3: Live Execution & Wire Transparency (1:45 – 3:00)
* **Visual:**
  1. Click **Trigger "Issue Credential" Flow**.
  2. Show QR code offer appear.
  3. Click **Trigger "Present & Verify" Flow**.
  4. Show Green `VALID` badge.
  5. Scroll down to show dynamic **Mermaid.js Sequence Diagram** and open the **Protocol Inspector**.
* **Speaker:**
  > "Let's run a live transaction. We click 'Trigger Issue Credential Flow'. The BFF coordinates the pre-authorized code exchange, generating a standard OpenID Credential Offer and cryptographic proof.
  > Next, our simulated holder presents the credential to the Verifier. The Verifier inspects the schema, checks the cryptographic signature against the issuer DID, and confirms validity.
  > Notice below: our dynamic sequence visualizer has automatically rendered the entire four-step protocol exchange from live wire logs. In the Protocol Inspector, developers can view and copy the raw HTTP payloads, headers, and cryptographic signatures with full syntax highlighting."

---

### Segment 4: Chaos Mode & Negative Verification (3:00 – 4:00)
* **Visual:**
  1. Enable **Tamper Mode**.
  2. Check **Expire Timestamp**.
  3. Re-run verification.
  4. Show Red `EXPIRED` badge and warning in the sequence diagram.
* **Speaker:**
  > "Interoperability also demands resilience against invalid or malicious data. We switch on 'Tamper Mode' and inject an expired timestamp into the presentation token.
  > Upon verification, our verifier engine immediately flags the failure with a red badge, rejecting the expired proof. The sequence visualizer updates in real time with a warning note, confirming robust defense mechanisms."

---

### Segment 5: The Certification Matrix & Summary (4:00 – 4:45)
* **Visual:** Switch to **Interop Matrix Report** tab showing the 8/8 PASS scorecard and export option.
* **Speaker:**
  > "Finally, our Interoperability Matrix Report aggregates all 8 permutation combinations across Inji and mock nodes. With 100% pass rate across both W3C VC and SD-JWT formats, the MOSIP ecosystem proves ready for cross-border, cross-vendor identity interoperability.
  > The entire project runs with a single command via Docker Compose. Thank you."
