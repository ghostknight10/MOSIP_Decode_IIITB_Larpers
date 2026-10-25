# Test Data

Everything needed to run and evaluate the playground: accounts, identities, settings and sample credentials. All of it is test data for public sandboxes. None of it is personal or secret.

---

## Accounts and identities

### MOSIP Collab test identity (real Inji issuance)

| Field | Value |
| --- | --- |
| Individual ID | `8267411578` (published by MOSIP in the `inji-certify` sample data) |
| Login | eSignet `https://esignet-mock.collab.mosip.net`, OTP |
| OTP | `111111` (the mock identity system's test OTP; nothing is actually sent) |
| Wallet client | Mimoto's `mpartner-default-mimoto-land-oidc`, redirect `io.mosip.residentapp.inji://oauthredirect` |
| Token | Mimoto `https://api.collab.mosip.net/v1/mimoto/get-token/Land` |
| Issuer | Inji Certify Land Registry, `https://injicertify-landregistry.collab.mosip.net` |
| Credential | `LandStatementCredential` (`ldp_vc`, Ed25519Signature2020, `did:web:injicertify-landregistry.collab.mosip.net`) |
| Setting | `COLLAB_TEST_INDIVIDUAL_ID=8267411578` in `.env` (the default in `.env.example`) |

The playground logs in and requests the credential automatically: choose **Inji Certify** with **W3C VC** (preset TC-01).

Other Collab Certify instances behind the same login (Farmer, driving licence) have no data for this ID and answer `ERROR_FETCHING_IDENTITY_DATA`.

### Identity created for this project

| Field | Value |
| --- | --- |
| Individual ID | `8267427212` |
| PIN | `545411` |
| Name, email, phone | Playground Tester, `playground.tester@example.org`, `+919000000001` (made up) |
| Created | 2026-10-25, in the Collab mock identity system |

It can log in to eSignet (OTP `111111`), but no Collab issuer has data for it, so it can't receive a credential. It is listed for completeness.

### BFF access

No account is needed. If `PLAYGROUND_TOKEN` is set in `.env`, the Vite proxy sends it automatically. Direct calls to the BFF need the header `x-playground-token: <value>`.

---

## Default credential subject (mock issuer)

Editable under **Phase 1 → Credential subject claims**.

| Claim | Value |
| --- | --- |
| `fullName` | Aaditya Sharma |
| `dob` | 1995-08-15 |
| `nationalId` | MOSIP-IND-9876-5432-1098 |
| `email` | aaditya.sharma@example.org |
| `country` | IND |

The verifiers ask for `fullName` and `nationalId` (or `UIN`, as in MOSIP ID credentials).

---

## Sample credentials

In [`docs/test-data/`](./test-data/). Paste any of them under **Phase 1 → Use a credential from outside the playground** (TC-09) to present it without issuing. Each was checked against live Inji Verify (`/v2/vc-verification`) on 2026-10-25.

| File | Format | Issuer | Inji Verify | Valid until |
| --- | --- | --- | --- | --- |
| `inji-land-statement-credential.json` | W3C VC (`ldp_vc`) | **Real Inji Certify** (Land Registry), issued to `8267411578` | `allChecksSuccessful: true` | 2028-10-24 |
| `mock-w3c-vc.json` | W3C VC (`ldp_vc`), Ed25519Signature2020 | Playground mock issuer (`did:key`) | `allChecksSuccessful: true` | 2027-10-25 |
| `mock-sd-jwt.txt` | SD-JWT VC, ES256, `x5c` | Playground mock issuer | `allChecksSuccessful: true` | 2027-10-25 |
| `mock-mdoc-issuer-signed.txt` | mDoc IssuerSigned (base64url CBOR) | Playground mock issuer | not supported by Inji Verify (G-10) | 2027-10-25 |

The mock issuer's and wallet's keys are generated each time the BFF starts. A newly started BFF's mock verifier therefore rejects these saved mock credentials: they were issued to another holder key by an issuer not in its trust list. That is the holder-binding and trust checks working. Inji Verify accepts them, because it checks signatures but not issuer trust (G-9). Freshly issued credentials from the running BFF pass both verifiers.

---

## Endpoints used

| Service | URL |
| --- | --- |
| Inji Verify | `https://injiverify.collab.mosip.net` (`/v1/verify/v2/vc-verification`, `/v1/verify/vc-verification`) |
| Inji Certify (MOSIP ID; metadata only) | `https://injicertify-mosipid.collab.mosip.net` |
| Inji Certify (Land Registry; real issuance) | `https://injicertify-landregistry.collab.mosip.net` |
| eSignet (mock identity) | `https://esignet-mock.collab.mosip.net` |
| Mimoto | `https://api.collab.mosip.net/v1/mimoto` |
| Mock identity system | `https://api.collab.mosip.net/v1/mock-identity-system` |

## Test cases and results

- Manual scenarios with expected results: [test-cases.md](./test-cases.md) (TC-01 to TC-09)
- Automated suites and counts: [testing.md](./testing.md)
- Results of a live run of every combination and attack: [interop-report.md](./interop-report.md) (raw: `interop-report.json`)
