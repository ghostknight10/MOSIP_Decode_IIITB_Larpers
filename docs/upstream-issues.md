# Upstream Issue Drafts

Draft reports for findings from running the playground against the MOSIP Collab sandbox on 2026-10-25. Each is ready to file on the named repository after a team member re-checks it. Nothing here has been filed yet.

- **U-1 to U-3:** functional or conformance problems. File them as public GitHub issues.
- **U-4:** a security weakness. Report it privately through MOSIP's security contact rather than in a public issue.

Short IDs in brackets refer to [known-issues.md](./known-issues.md).

---

## U-1 · Mimoto's issuer registry points at a well-known URL that Inji Certify does not serve [G-3]

**Repository:** `inji/mimoto` (Collab configuration)

**What happens**

`GET https://api.collab.mosip.net/v1/mimoto/issuers/Mosip` returns:

```json
"wellknown_endpoint": "https://injicertify-mosipid.collab.mosip.net/v1/certify/issuance/.well-known/openid-credential-issuer"
```

That URL answers `404` (`No static resource issuance/.well-known/openid-credential-issuer`). Inji Certify serves its metadata at:

- `/v1/certify/.well-known/openid-credential-issuer`
- `/.well-known/openid-credential-issuer`

Both return `200`. Other entries have the same pattern: StayProtected, Land, MockMdl, GlobalIDPass, MosipTAN and TruckPass also use `…/issuance/.well-known/…`.

**Expected:** the registry points at a metadata URL that resolves.

**Impact:** any wallet that follows the registry's `wellknown_endpoint` cannot discover the issuer.

**Reproduce**

```bash
curl -s https://api.collab.mosip.net/v1/mimoto/issuers/Mosip | jq -r .response.wellknown_endpoint
curl -s -o /dev/null -w '%{http_code}\n' "$(curl -s https://api.collab.mosip.net/v1/mimoto/issuers/Mosip | jq -r .response.wellknown_endpoint)"
```

---

## U-2 · Credential endpoint answers 403 instead of 401 `invalid_token` without an access token [G-4]

**Repository:** `inji/inji-certify`

**What happens**

`POST https://injicertify-mosipid.collab.mosip.net/v1/certify/issuance/credential` with no `Authorization` header returns:

```json
{"status":403,"error":"Forbidden","path":"/v1/certify/issuance/credential"}
```

There is no `WWW-Authenticate` header.

**Expected:** OpenID4VCI (Credential Error Response) and RFC 6750 §3.1 call for `401 Unauthorized` with `WWW-Authenticate: Bearer error="invalid_token"`. Wallets use this to start or retry authorization.

**Reproduce**

```bash
curl -si -X POST https://injicertify-mosipid.collab.mosip.net/v1/certify/issuance/credential \
  -H 'content-type: application/json' \
  -d '{"format":"ldp_vc","credential_definition":{"type":["VerifiableCredential","MOSIPVerifiableCredential"]}}'
```

---

## U-3 · Inji Verify's service never routes `mso_mdoc` to the mDoc verifier [G-10]

**Repository:** `inji/inji-verify` (`verify-service`)

**What happens**

`vc-verifier` includes `MsoMdocVerifiableCredential` and `MsoMdocVerifier`, but `verify-service` cannot reach them:

- `VCVerificationServiceImpl.verify` (v1, `/vc-verification`) maps the `Content-Type` to `VC_SD_JWT`, `CWT_VC` or `LDP_VC`. Everything else is treated as LDP.
- `Utils.getCredentialFormat` (v2, `/v2/vc-verification`) detects only CWT and SD-JWT, and otherwise returns `LDP_VC`.

A valid mDoc therefore fails as malformed JSON-LD:

```json
{"allChecksSuccessful":false,"schemaAndSignatureCheck":{"valid":false,"error":{"errorCode":"ERR_GENERIC","errorMessage":"Exception during Validation: A JSONObject text must begin with '{' at 1 [character 2 line 1]"}}}
```

**Expected:** one of these:
- v1 accepts `Content-Type: application/mso_mdoc` (or similar).
- v2 detects base64url CBOR and uses `CredentialFormat.MSO_MDOC`.

**Reproduce:** POST any base64url mDoc Document (`{docType, issuerSigned}`) as `verifiableCredential` to `/v1/verify/v2/vc-verification`. The playground's mock issuer produces one (format "mDoc (ISO 18013-5)", **Inspect credential**).

---

## U-4 · Issuer trust is not checked: any self-signed certificate or `did:key` issuer verifies [G-9] (report privately)

**Repositories:** `inji/vc-verifier`, `inji/inji-verify`

**What happens:** Inji Verify returned `SUCCESS` for credentials that the playground signed with keys it generated at startup:
- **W3C `ldp_vc`:** `Ed25519Signature2020` from a fresh `did:key`.
- **SD-JWT VC:** ES256 with a freshly generated self-signed X.509 certificate in `x5c`.

In `MsoMdocVerifier`, `verifyCertificateChain` is a `TODO` that returns `true`.

**Why it matters:** anyone can mint a credential that Inji Verify reports as valid. A relying party using `/vc-verification` as its trust decision would accept forged identity documents, unless it checks the issuer separately against a trust list. The API response gives no sign that trust was not evaluated.

**Expected:** at least one of these:
- Configurable trust anchors (trusted issuer DIDs, an IACA/DS certificate list for mDoc and x5c).
- A distinct result such as `ISSUER_NOT_TRUSTED`.
- Documentation that `/vc-verification` checks integrity only, so callers must check the issuer.

**Evidence:** run TC-05a in the playground ("Mock issuer → Inji Verify"). The step `Verify credential (/v2/vc-verification)` is marked Live and returns `allChecksSuccessful: true`.

---

## Notes that are not bugs

- **Type and holder binding are not checked by `/vc-verification`** [G-8]. It verifies a credential, not a presentation, so a wrong credential type, a replayed submission or a missing holder proof are all accepted. This is expected for the endpoint. A relying party needs OpenID4VP (presentation definition plus nonce) for those checks. The playground records such runs as FAIL, with an explanation.
- **No SD-JWT or mDoc configuration on `injicertify-mosipid`** [G-5]. This is Collab configuration, not a product gap.
- **Claim names** [G-6]. Real MOSIP ID credentials use `UIN` and `dateOfBirth`. The playground's presentation definition accepts `UIN` as an alias for `nationalId`.
