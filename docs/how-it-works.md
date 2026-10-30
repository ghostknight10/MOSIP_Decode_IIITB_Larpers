# How It Works: A Plain-Language Guide

For team members who need to explain the project, demo it, or answer a jury's questions without having written the code. Read it once, then try the demo steps at the end. Technical detail lives in [architecture.md](./architecture.md); what is real and what is not is in [known-issues.md](./known-issues.md).

---

## The one-minute explanation

Governments and companies want people to hold digital documents (a national ID, a licence) in a phone wallet and show them to someone who can check them. Three roles take part:

- **Issuer:** creates and signs the document.
- **Wallet (holder):** keeps it and shows it.
- **Verifier:** checks it.

These roles should work with **any** product, not only the ones from one vendor. That is called **interoperability**. MOSIP's Inji stack provides all three roles (Inji Certify, Inji Wallet, Inji Verify). But does Inji really work with software it has never met?

Our **playground** is a web page where you pick an issuer, a wallet and a verifier, press one button, and watch the whole exchange happen: every message, every signature check, and a pass/fail report. You can also attack the document (expire it, break its signature, swap its type, replay an old answer) and see who catches it.

**What we found:** Inji Verify works with credentials from our own issuer, but it cannot verify a credential from an independent issuer (Walt.id) because it insists on a certificate chain. We also found that it doesn't check *who* issued a credential. Those are the kind of gaps the problem statement asks for.

---

## Words you will need

| Word | Meaning |
| --- | --- |
| **Verifiable Credential (VC)** | A digital document with claims (name, ID number) and a cryptographic signature, so anyone can check it came from the issuer and wasn't altered. |
| **Signature** | Maths that proves "this exact data was signed by the owner of this key". Change one character and it fails. |
| **OpenID4VCI** | The standard way a wallet **gets** a credential from an issuer (VCI = Verifiable Credential Issuance). We use Draft 13. |
| **OpenID4VP** | The standard way a wallet **shows** a credential to a verifier (VP = Verifiable Presentation). We use Draft 21. |
| **W3C VC (JSON-LD)** | A credential format: JSON with a signature "proof" attached. |
| **SD-JWT VC** | A format where the holder can reveal only some claims ("selective disclosure"), e.g. the name but not the birth date. |
| **mDoc (ISO 18013-5)** | The format of mobile driving licences. A compact binary (CBOR) format. |
| **Nonce** | A one-time random value the verifier gives the wallet. The wallet signs it into its answer, so an old answer can't be reused (**replay protection**). |
| **Holder binding** | Proof that the person presenting the credential is the one it was issued to (the wallet signs with its own key). |
| **Trust list** | The issuers a verifier is willing to accept. A valid signature from an unknown issuer should still be rejected. |
| **Collab sandbox** | MOSIP's public test environment for Inji (Certify, Verify, Mimoto, eSignet). |
| **Mimoto** | The backend of the Inji wallet. We use it to get access tokens. |
| **eSignet** | MOSIP's login service. Inji Certify only issues after you log in. |
| **BFF** | "Backend for frontend": our server between the web page and the other services. It also keeps the logs. |
| **Walt.id** | A different company's OpenID4VC software. We use its public demo as the **independent** (non-MOSIP) implementation. |

---

## What happens when you press "Run Full Flow"

1. **The page sends one request to our server (BFF)** with a transaction ID, so every message of this run is grouped together.
2. **Issue (OpenID4VCI).** Depending on your choice:
   - *Mock issuer:* our code signs a credential with real keys.
   - *Inji Certify:* our server logs in to eSignet as a Collab test identity (the published test one, with the fixed test OTP), gets a token through Mimoto, and asks Certify for a credential. All real.
   - *Walt.id:* our server asks Walt.id's demo to prepare an offer, then plays the wallet: fetches the offer, the token and the credential.
3. **Hold.** The wallet (ours, simulated) keeps the credential.
4. **Present (OpenID4VP).** The verifier sends a request (what it wants, plus a nonce). The wallet answers with only the requested claims, signed together with the nonce.
5. **Verify.** The verifier checks the signature, the issuer, the expiry, the type and the nonce. It answers Valid, Invalid, Expired or Signature mismatch.
6. **Everything is recorded:** each message as a step in the inspector (marked **Live** if it really went to an outside service), a row in the run history, and numbers in the telemetry panel.

If an outside service is down, our server falls back to its own mock and **says so in a banner**. Nothing is silently faked.

---

## What is real and what is emulated

| Thing | Status |
| --- | --- |
| Inji Verify | **Real** (live calls, its own verdicts) |
| Inji Certify issuance | **Real** with the test identity set in `.env`; otherwise emulated |
| eSignet login, Mimoto token | **Real** |
| Walt.id issuer and verifier | **Real** (public demo) |
| Our mock issuer, wallet, verifier | Our code, but with **real cryptography** (real keys, signatures, nonces) |
| The wallet | **Simulated.** It is our code, not the Inji mobile app. |
| mDoc | From our mock issuer only. Inji Verify's service cannot verify mDoc. |
| Inji Verify's OpenID4VP flow | **Not available** on the sandbox, so Inji Verify checks a credential directly, not a presentation. |

---

## Where things are in the code

| You want to show… | Look at |
| --- | --- |
| The three-column selector | `frontend/src/components/MatrixSelector.tsx`, nodes in `frontend/src/config/nodes.ts` |
| The run logic and history | `frontend/src/hooks/usePlaygroundRun.ts` |
| The inspector and diagram | `ProtocolInspector.tsx`, `SequenceDiagram.tsx` |
| The report and heatmap | `InteropMatrixReport.tsx`, `report/InteropHeatmap.tsx` |
| Our server's routes | `backend/src/routes/playground.ts` |
| Real Inji calls | `backend/src/services/collab.ts`, `injiIssuance.ts` |
| Walt.id calls | `backend/src/services/walt.ts` |
| Our mock issuer / verifier | `backend/src/mocks/mockService.ts` |
| The wallet and the attacks | `backend/src/mocks/wallet.ts` |
| Signatures and keys | `backend/src/mocks/crypto.ts`, `mdoc.ts` |
| The report generator | `backend/scripts/interop-report.ts` |

---

## Likely questions, and honest answers

**What does it do that the existing "VC playground" doesn't?**
It is built around Inji: it talks to the real Inji services, labels every real step, and focuses on *where* things fail (by layer) and on attacks, not only on happy paths.

**Is it really using Inji, or is it all fake?**
Inji Verify and Inji Certify (with the test identity) are real calls, and you can see them marked **Live**. The wallet is simulated. We say so openly.

**Why a simulated wallet?**
Driving the Inji mobile app from a web page needs a phone and a tunnel, and the app uses its own list of issuers. Our wallet does the same protocol steps in code, which also lets us run hundreds of combinations automatically.

**What does "interoperability" mean here, concretely?**
That a credential made by one product is accepted by another. The report shows exactly which pairs work. For example: our credentials pass Inji Verify and Walt.id; Walt.id's credentials pass our verifier and Walt.id's, but fail Inji Verify.

**Why does Inji Verify reject Walt.id's credential?**
Inji Verify's SD-JWT check requires an X.509 certificate chain in the token. Walt.id identifies its issuer by a DID instead (as many OpenID4VC systems do). So Inji Verify can't find the key. It's a real gap in compatibility.

**What do the failed cells in the report mean?**
They are expected and explained: Inji Verify checks credentials, not presentations, so it can't catch a wrong type or a replay; the real Inji credential has no holder binding, so our strict verifier rejects it; Walt.id's verifier can't parse key binding, so it also accepts replays.

**How does the replay attack work, and why is it caught?**
The wallet answers with the one-time code from an *earlier* request. Our verifier remembers each code once and checks the answer signs the current one. Walt.id and Inji Verify don't bind the answer to a code, so they accept it.

**How do you make the attacks real?**
The mock issuer signs an expired or wrong-type credential properly (so the verifier must catch it by checking, not by a broken signature), or the signature bytes are altered. We don't just set a flag.

**What is the "Live" label?**
A step that went over the internet to a real service. Steps without it were handled by our own code.

**What is the telemetry for?**
It's a bonus task: it counts requests, success rate and latency per flow and per service, and can be scraped by tools like Prometheus.

**How is it tested?**
Hundreds of automated tests (frontend and backend, offline), a CI pipeline that builds it and starts it in Docker on every push, and a nightly job that runs the full report against the real sandbox. See [testing.md](./testing.md) and [interop-report.md](./interop-report.md).

**Did you find real problems in MOSIP's software?**
Yes (documented in [known-issues.md](./known-issues.md)), for example that Inji Verify accepts credentials from any issuer and can't verify mDoc. We haven't reported them upstream yet because we want to understand them fully first.

**Much of this was written with AI. Can you explain it?**
Yes: that is what this guide is for. The design is simple at its core: a web page, a server that runs the roles, and real calls to real services, with every step recorded. Be ready to explain any file in the table above.

**What would you do next?**
Test with the real Inji mobile wallet on a phone, add more independent implementations, support OpenID4VP on Inji Verify when the sandbox offers it, and report the findings to the Inji teams.

---

## Don't say

- "Fully tested against the Inji wallet." (It is a simulated wallet.)
- "Inji Verify runs OpenID4VP in our demo." (It checks the credential only.)
- "mDoc works with Inji." (Only with our own verifier.)
- Any number you haven't re-checked in [interop-report.md](./interop-report.md) right before presenting.

---

## Six-step demo cheat sheet

1. Open the app, point at the **three columns** and the **format** switch.
2. Click **TC-01**. While it runs, say what is happening: login, token, credential, verification. Point at the **Live** labels in the inspector.
3. Open the **Protocol inspector**, click one step, show the raw payload. Show **What was shared**.
4. Click **TC-04** (corrupted signature) and show the rejection and the layer it belongs to.
5. Click **TC-10** (credential from Walt.id), then switch the verifier to Inji Verify and show it fail. Explain why.
6. Open the **Interop Matrix Report** and show the heatmap and the telemetry.
