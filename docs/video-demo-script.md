# MOSIP Interoperability Playground — Video Demo Script (3 to 5 Minutes)

This script covers the problem, live matrix execution, the wire inspector, negative paths and the interoperability report, in at least one full issue → hold → present → verify cycle with the protocol inspector visible (as the deliverables require).

**Before recording:**

- `docker compose up --build`, open <http://localhost:5173> and check the header shows **Online (Collab/Mock)**.
- Clear old runs (**Interop Matrix Report → Clear**) so the report starts at 0 / 16.
- Have a phone with a QR scanner ready for Segment 3.
- Start the BFF with `COLLAB_TEST_INDIVIDUAL_ID=8267411578` so the all-Inji run issues a real credential (eSignet login, Mimoto token, Inji Certify) and verifies it on Inji Verify; every step carries a **Live** chip. Without it, Certify's credential is emulated: say so on camera rather than hiding it.

---

## Segment 1: The problem & the solution (0:00 – 0:40)

- **Visual:** title slide, then the playground landing screen.
- **Speaker:**
  > "Digital identity only works if a credential issued by one system can be held by another vendor's wallet and verified by a third party. Each MOSIP Inji module speaks open standards, but proving they interoperate with each other, and with implementations outside MOSIP, has meant stitching tools together by hand.
  > The MOSIP VC Interoperability Playground puts that in one screen: pick an issuer, a wallet and a verifier, run the full OpenID4VCI and OpenID4VP flow, see every payload, and get a pass/fail report."

## Segment 2: The 3-column matrix & three formats (0:40 – 1:20)

- **Visual:** hover across the three columns, then toggle the format.
- **Speaker:**
  > "Column one is the issuer: Inji Certify, or our standards-based OpenID4VCI Draft 13 mock. Column two is the wallet: Inji Web or Mobile through Mimoto, or a simulated holder. Column three is the verifier: Inji Verify, or our OpenID4VP Draft 21 mock.
  > At the top, we switch between W3C Verifiable Credentials with JSON-LD proofs, IETF SD-JWT with selective disclosure, and ISO mDoc, the mobile driving licence format. Every credential is really signed, and every run is labelled with its format."

## Segment 3: Live issue → hold → present → verify (1:20 – 2:40)

- **Visual:**
  1. Click the **TC-02 Happy path · SD-JWT** quick scenario. The matrix switches nodes and format, the badges move Standby → Done → VALID, and the live protocol view on the right fills with four steps.
  2. Point at the **Credential Offer QR** ("scan with the wallet app on your phone") and scan it with the phone to show the `openid-credential-offer://` link.
  3. Open **Inspect credential**: header, payload, signature and disclosures, each labelled, with the "Digest in _sd" column.
  4. Show the green **VALID** card, then **What was shared**: the custody line and the four groups.
  5. In the live view, press **First step**, then **Play**. The timeline, sequence diagram and raw inspector replay the exchange step by step.
- **Speaker:**
  > "One click runs a documented scenario. The issuer produces a pre-authorized credential offer, the QR code a phone wallet scans. Inspect credential splits the SD-JWT into its parts and checks every disclosure against the issuer's signed digests.
  > The verifier accepts it, and What was shared answers the question users ask most: who got which of my data? It asked for two claims and received exactly those two; the other three never left the wallet. If a verifier ever received more, this panel would flag it as over-disclosure.
  > On the right, the same transaction replays step by step: timeline, sequence diagram and every raw request and response."
- **On the all-Inji run:**
  > "These steps marked Live are real calls to the MOSIP Collab sandbox. The wallet logs in to eSignet as a Collab test identity, gets a token through Mimoto, and Inji Certify issues a real land statement credential. Inji Verify then checks it for real: signature, expiry and status, each reported separately, and accepts it. Tamper with it and Inji Verify catches the expired or forged credential, but not a replayed one, because it verifies credentials, not presentations. The playground's own verifier catches that, and the report shows exactly where each verifier stands."

## Segment 4: Negative paths (2:40 – 3:20)

- **Visual:** click **TC-03 Expired credential**. Show the red **EXPIRED** card labelled **Valid but Expired**. Then click **TC-04 Corrupted signature** and show **SIGNATURE_MISMATCH**, the tampered step in the timeline, and the **⚠️ Tampered Payload Detected!** note in the diagram.
- **Speaker:**
  > "Interoperability also means rejecting bad data. An expired credential is rejected, and the signature still checks out, so it's 'valid but expired'. A corrupted signature is caught, and the timeline and diagram mark exactly which message was tampered with. Both count as passes, because the verifier did the right thing."

## Segment 5: The interoperability report (3:20 – 4:30)

- **Visual:**
  1. Open **Interop Matrix Report** and click **Run All Combinations**. Let the counter reach 20 / 20.
  2. Show the **heatmap** (issuer × wallet by verifier × format) and the separate **Real** and **Emulated** scores.
  3. Open **Failure layers** to show the Technical / Syntactical / Semantic / Organizational legend.
  4. Click a cell to filter Run History to that combination, then click **Markdown** and open the export.
- **Speaker:**
  > "Run All Combinations exercises every issuer, wallet, verifier and format: twenty supported combinations, and it marks the four Inji Verify cannot handle (mDoc) as not supported. The heatmap shows where things work, and when something fails it says at which interoperability layer: transport and crypto, format, schema, or policy. Real MOSIP results and emulated ones are scored separately, so the numbers are honest.
  > Click a cell to drill into its runs, and export everything as Markdown: that's our interoperability report."

## Segment 6: Close (4:30 – 4:50)

- **Visual:** terminal running `npm test`, then `docker compose up`.
- **Speaker:**
  > "Everything runs with one Docker Compose command, with over 350 automated tests in CI. The design choices are grounded in usability research on identity wallets, and the gaps we found are documented for the Inji teams. Thank you."
