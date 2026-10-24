# MOSIP Interoperability Playground — Video Demo Script (3 to 5 Minutes)

This script covers the problem, live matrix execution, the wire inspector, negative paths and the interoperability report, in at least one full issue → hold → present → verify cycle with the protocol inspector visible (as the deliverables require).

**Before recording:**

- `docker compose up --build`, open <http://localhost:5173> and check the header shows **Online (Collab/Mock)**.
- Clear old runs (**Interop Matrix Report → Clear**) so the report starts at 0 / 16.
- Have a phone with a QR scanner ready for Segment 3.
- If the Collab sandbox is still unreachable, Inji nodes show **Emulated**. Say so on camera (see the Segment 3 note) rather than hiding it.

---

## Segment 1: The problem & the solution (0:00 – 0:40)

- **Visual:** title slide, then the playground landing screen.
- **Speaker:**
  > "Digital identity only works if a credential issued by one system can be held by another vendor's wallet and verified by a third party. Each MOSIP Inji module speaks open standards, but proving they interoperate with each other, and with implementations outside MOSIP, has meant stitching tools together by hand.
  > The MOSIP VC Interoperability Playground puts that in one screen: pick an issuer, a wallet and a verifier, run the full OpenID4VCI and OpenID4VP flow, see every payload, and get a pass/fail report."

## Segment 2: The 3-column matrix & two formats (0:40 – 1:20)

- **Visual:** hover across the three columns, then toggle the format.
- **Speaker:**
  > "Column one is the issuer: Inji Certify, or our standards-based OpenID4VCI Draft 13 mock. Column two is the wallet: Inji Web or Mobile through Mimoto, or a simulated holder. Column three is the verifier: Inji Verify, or our OpenID4VP Draft 21 mock.
  > At the top, we switch between W3C Verifiable Credentials with JSON-LD proofs and IETF SD-JWT with selective disclosure. Every run is labelled with its format."

## Segment 3: Live issue → hold → present → verify (1:20 – 2:40)

- **Visual:**
  1. Click **Trigger "Issue Credential" Flow**. The issuer badge turns **Done** and the wallet badge shows **Holding VC**.
  2. Show the **Credential Offer QR** and scan it with the phone to show the `openid-credential-offer://` link. Point out the credential summary (format, proof type, expiry).
  3. Click **Trigger "Present & Verify" Flow**. Show the green **VALID** card with its four checks and the Authorization Request QR.
  4. Scroll to the **sequence diagram**, then click through frames in the **Protocol Inspector** (request/response tabs, Copy JSON).
- **Speaker:**
  > "We issue a credential. The issuer produces a standard pre-authorized-code credential offer, which is this QR code. A mobile wallet can scan it, or a browser wallet can open it as a deep link. The wallet now holds the credential.
  > Now the wallet presents it. The verifier sends a presentation definition, and the wallet answers with a vp_token. Format, signature, expiry and schema all check out, so it's valid.
  > Below, the sequence diagram is generated from the actual wire logs of this one transaction, and the inspector shows every raw request and response, ready to copy."
- **If Inji nodes show Emulated:**
  > "The Inji nodes are marked Emulated because the Collab sandbox wasn't reachable during recording. The playground falls back to a standards-compliant emulation and tells you so, and the report flags those runs as well."

## Segment 4: Tamper mode & negative paths (2:40 – 3:30)

- **Visual:**
  1. Click **Enable Tamper Mode** and tick **Expire Timestamp**, then **Run Full Flow**. Show the red **EXPIRED** card labelled **Valid but Expired**.
  2. Untick it, tick **Corrupt Cryptographic Signature** and run again. Show **SIGNATURE_MISMATCH** and the **⚠️ Tampered Payload Detected!** note in the diagram.
- **Speaker:**
  > "Interoperability also means rejecting bad data. We expire the credential at presentation time, and the verifier rejects it. The signature is still fine, which is why it reads 'valid but expired'.
  > Now we corrupt the signature, and the verifier catches the mismatch. The sequence diagram marks exactly which step was tampered with. In the report, both count as passes, because the verifier did the right thing."

## Segment 5: The interoperability report (3:30 – 4:30)

- **Visual:**
  1. Open **Interop Matrix Report**, click **Run All Combinations** and let the progress counter run to 16 / 16.
  2. Show the matrix (issuer, wallet, verifier, format, proof type, status, error detail), the pass rate and the negative-path count.
  3. Filter the history by **Tampered only**, then click **Markdown** and open the exported file.
- **Speaker:**
  > "One click runs every combination: two issuers, two wallets, two verifiers, two formats, sixteen in all. The report is built from those real runs. Anything not yet run shows as untested, and anything that fails shows why.
  > We export it as Markdown, and that file is our interoperability report: what was tested, with what, and the outcome."

## Segment 6: Close (4:30 – 4:50)

- **Visual:** terminal running `npm test`, then `docker compose up`.
- **Speaker:**
  > "Everything runs with one Docker Compose command. Around 250 automated tests run in CI on every push, and the interoperability gaps we found are documented for the Inji teams. Thank you."
