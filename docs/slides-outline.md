# Pitch Deck Outline (paste into Gamma)

How to use: in Gamma choose **Create new → Paste in text**, paste everything below the line, and pick "Preserve this text" or "Condense" as you like. Each `---` is a slide break. Suggested theme: light, white background, one plum accent (`#951f6f`, MOSIP's colour), Inter font. Screenshots to add are in square brackets.

Every number below comes from the repo: [interop-report.md](./interop-report.md), [testing.md](./testing.md) and [known-issues.md](./known-issues.md). Re-check them against those files before presenting.

---

# MOSIP VC Interoperability Playground

Issue, hold, present and verify Verifiable Credentials across Inji and independent implementations, and see exactly where they do and don't interoperate.

Team Larpers · IIIT Bangalore · MOSIP Decode, Problem Statement 02

[Screenshot: matrix with a finished run]

---

# The problem

- Digital identity ecosystems (eSignet, EUDI wallets, national ID stacks) need proof that Inji works with implementations **outside** MOSIP, not only with itself.
- Today, testing that means stitching together separate tools, reading raw HTTP, and guessing which layer failed.
- Integrators can't answer a simple question: **"Will my issuer, wallet and verifier work together?"**

---

# Our solution

A single web app where anyone can:

1. **Pick** an issuer, a wallet and a verifier (Inji or mock), and a credential format
2. **Run** the live flow: issue → hold → present → verify
3. **Inspect** every request and response as it happens
4. **Read** a pass/fail report that says which layer broke

[Screenshot: the 3-column Issuer → Wallet → Verifier selector]

---

# It talks to the real Inji stack

A real run, end to end, on the MOSIP Collab sandbox:

- **eSignet:** automated citizen login with a published test identity
- **Mimoto:** access token through its token service
- **Inji Certify:** issues a real credential
- **Inji Verify:** verifies it live (signature, expiry, status, each reported separately)

Every real step is marked **Live** in the inspector. Anything emulated is labelled, never hidden.

[Screenshot: timeline with the Live steps]

---

# Three credential formats, really signed

| Format | How it is signed |
| --- | --- |
| W3C VC (JSON-LD) | Ed25519Signature2020, `did:key` issuer |
| SD-JWT VC | ES256, X.509 certificate, selective disclosure, key-binding JWT |
| mDoc (ISO 18013-5) | COSE_Sign1 Mobile Security Object, device-signed response |

Live Inji Verify accepts our clean W3C and SD-JWT credentials and rejects the tampered ones.

---

# Protocol transparency

- **Protocol inspector:** raw payloads for each step (offer, token, authorization request, `vp_token`, result), with headers, search, copy
- **Animated sequence diagram** (Mermaid) and a **step-by-step replay**
- **"What was shared?"** shows what the verifier asked for, received, and never saw
- **Live streaming** of steps while a run is in progress

[Screenshot: inspector next to the sequence diagram]

---

# Replay and tamper mode: real attacks

Tamper mode changes the credential, not a flag:

- **Expired** credential
- **Corrupted signature**
- **Wrong credential type**
- **Replayed presentation** (an old answer reused; blocked by single-use nonces and holder binding)

Our verifier catches all four. Inji Verify catches expiry and bad signatures; it checks credentials, not presentations.

---

# The interoperability report

20 supported combinations (issuer × wallet × verifier × format) plus 20 attack runs, against the live sandbox.

- **18 / 20** clean runs pass
- **16 / 20** attacks correctly rejected
- Every failure is labelled with its layer: Technical, Syntactical, Semantic or Organizational
- Filter run history by format, outcome, mode, layer and **Inji component build**
- Nightly CI regenerates the report against Collab

[Screenshot: heatmap]

---

# Gaps we found in the stack

Real findings from live testing:

- Inji Verify accepts **any** issuer (no trust check)
- Inji Verify can't verify **mDoc** at all
- Collab's Certify speaks **OpenID4VCI 1.0**, not Draft 13
- Issued credentials aren't bound to the holder
- Number encoding differs between Java and JavaScript signing, so JS verifiers reject credentials Inji accepts
- Mimoto's registry points at a metadata URL that returns 404

All documented with evidence. We're being careful to understand them before reporting upstream.

---

# How it's built

Browser UI (React 19, TypeScript, Tailwind, Vite) → Playground BFF (Node, Express) → Collab services (eSignet, Mimoto, Inji Certify, Inji Verify) and our mock engine (issuer, wallet, verifier, real cryptography).

[Diagram: use the one in docs/architecture.md]

- Docker Compose: one command to run everything
- Optional access token for the backend
- Secrets and tokens redacted in all logs

---

# Quality

- **550 automated tests** (375 frontend, 175 backend), offline and repeatable
- CI on every push; nightly live run against Collab
- Accessibility: WCAG-checked colour contrast, keyboard focus, never colour alone
- Documented API, test data, test cases and results

---

# Who it's for, and impact

- **Inji integrators:** know in minutes whether a wallet or verifier works with Inji
- **MOSIP core teams:** a regression tracker and a source of real gaps
- **Digital-identity ecosystems:** evidence of cross-ecosystem interoperability

Open source, runnable with one command, ready for nightly regression tracking.

---

# What's next

- Test with the real Inji mobile wallet (QR scan)
- Add an external reference implementation (Walt.id / Sphereon) for stronger cross-ecosystem proof
- Share the findings with the Inji teams once we can answer their questions confidently

---

# Thank you

Repo: github.com/ghostknight10/MOSIP_Decode_IIITB_Larpers

Ayaan · Aatraya · Aryan · Yug · Amogh

[Screenshot or QR code to the repo]
