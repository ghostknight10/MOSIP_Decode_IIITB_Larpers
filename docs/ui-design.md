# UI Design: Research and Decisions

This document records why the playground UI looks and behaves the way it does. Each decision traces back to a problem found by reviewing screenshots of the first version, to published research, or to comparable tools.

---

## 1. Problems in the first version

Screenshots at 1440px (desktop) and 390px (phone) showed these problems:

| Problem | Effect |
| --- | --- |
| The idle page was mostly two empty panels (diagram, inspector) | Nothing tells a newcomer what to do first |
| Results appeared below the fold, far from the buttons that caused them | Users scroll back and forth between cause and effect |
| The sandbox banner concatenated backend notices | Hard to read, and it said "reached" when the sandbox was not reached |
| The report said "100% pass rate" when most results were emulated | Overstated evidence |
| The SD-JWT was shown only as a raw string | Selective disclosure was invisible |
| Nothing showed what the verifier actually received | Data control was invisible |
| A 16-row flat matrix table | Hard to scan for patterns |
| Phone layout was a ~4,100px scroll with an unreadable diagram | Unusable on mobile |

## 2. Evidence

### Research

| Source | Finding | What we did |
| --- | --- | --- |
| [Korir, Parkin & Dunphy, SOUPS 2022](https://www.usenix.org/conference/soups2022/presentation/korir): contextual inquiry with 30 participants on a decentralized identity wallet | Pain points with QR codes and with "signposting of cross-device user journeys". Users could not tell whether the user, identity provider or relying party was in control of data at crucial moments. | QR panels say which device does what, and phones lead with the same-device link. The **What was shared** panel shows the issuer → wallet → verifier custody of every claim. |
| [Sartor et al., ECIS 2022, "Love at First Sight?"](https://publications.uni.lu/handle/10993/50968): UX study of four SSI wallets | Decent UX, but wallets failed to make their novelty and benefits visible. | Make selective disclosure and minimisation visible: **Inspect credential** (disclosures and digest checks) and **What was shared** (claims kept private vs over-shared). |
| [Schumm, Müller & Stiller, 2025, "Are We There Yet?"](https://arxiv.org/abs/2503.15964) | Interoperability has five layers (technical, syntactical, semantic, organizational, legal); the technical layer is the hardest. Usability is under-researched. | Report failures are tagged with the layer they broke at, so the matrix shows *where* ecosystems disagree, not just *that* they do. |
| [SoK: Self-Sovereign Digital Identities, 2026](https://arxiv.org/abs/2603.06896) | Empirical usability studies of SSI are rare; usability is a major adoption barrier. | Treat comprehension as a first-class goal of a testing tool, not just protocol correctness. |
| [Nielsen Norman Group: progress indicators](https://www.nngroup.com/articles/progress-indicators/) and [visibility of system status](https://www.nngroup.com/articles/visibility-system-status/); [Nielsen, "Progress Indicators" (UX Tigers)](https://www.uxtigers.com/post/progress-indicators) | Tell users what the system is doing (NN/g); a progress indicator should never stall, lie or reset (Nielsen). | Live per-role status badges, a step timeline that doubles as a progress track, and replay positions that always state "Step k of N". |
| [WCAG 2.2 SC 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color) | Colour must not be the only way to convey information; a colour legend alone does not satisfy it. | Every status pairs an icon and a text label with its colour. SD-JWT parts are colour-coded *and* labelled. Heatmap cells carry text plus a full accessible name. |

Earlier protocol-visualisation work ([Nam](https://ant.isi.edu/bib/Estrin00b.html) and EVGATOR) argues for letting users skim a trace at a high level before zooming in. That's the model for the timeline → diagram → raw inspector stack and for replay.

### Comparable tools

| Tool | Pattern | What we took |
| --- | --- | --- |
| [walt.id Portal2](https://docs.walt.id/community-stack/issuer2/apps/portal2/overview) | Simple mode (guided forms) vs advanced mode (raw JSON); a live event log as the wallet acts | Scenario presets up front, advanced inputs collapsed; a live protocol view beside the controls |
| [iGrant.io JWT / SD-JWT decoder](https://docs.igrant.io/docs/devtools-jwt-decoder.md) | Header, payload, disclosures and key-binding JWT shown separately | The **Inspect credential** SD-JWT view, plus digest checks |
| [France Identité playground](https://playground.france-identite.gouv.fr/doc/marketplace/) | Partners listed by role (wallets, verifiers, issuers) and by protocol, as link lists | Confirms role-first organisation. It has no side-by-side comparison, which is where our matrix adds value |
| [wpt.fyi Interop dashboard](https://web.dev/blog/interop-2025) | A score per participant plus an overall score | The heatmap and the separate real vs emulated scores |
| [OpenID Foundation conformance suites](https://www.biometricupdate.com/202608/openid-opens-certification-for-digital-id-issuance-verification-protocols) | Test plans per role (wallet, issuer, verifier) | Per-role status in the matrix |

## 3. Decisions

1. **Actions beside effects.** On wide screens, flow controls sit on the left and a sticky live protocol view on the right. It shows the current run by default, with an "All runs" toggle.
2. **No empty panels.** Before the first run, one sentence explains what to do.
3. **Presets first.** Six scenarios mirror TC-01 to TC-05. Each one visibly sets the matrix and the attack, so the run is reproducible by hand.
4. **Honest status.** Emulation is reported per role and per phase. Real and emulated results are scored separately, and the report warns when no real MOSIP result exists.
5. **Make privacy visible.** The SD-JWT decoder (with `_sd` digest checks) and the "What was shared" panel.
6. **Skim, then zoom.** Timeline → sequence diagram → raw messages, plus replay.
7. **Where it broke.** The heatmap, with failure layers and drill-down into run history.
8. **Phones are different.** Options sit side by side, the timeline replaces the diagram, raw messages are collapsed, and the same-device link comes first.
9. **Accessible by default.** Text and icon for every status, real tables with headers, radio groups for exclusive choices, polite live regions, a keyboard-operable slider and cells, no autoplay under `prefers-reduced-motion`, and at least 12px text.

## 4. What the new views revealed

The new panels surfaced real findings in the mock engine and BFF. They are logged in [known-issues.md](./known-issues.md):

- **G-5:** the mock SD-JWT's disclosure digests are not in `_sd`, and every claim is also in clear in the payload, so nothing is actually selectively disclosed.
- **G-6:** the mock verifier receives the whole credential subject (over-disclosure on every run).
- **B-9:** on sandbox fallback, the BFF overwrites the sender of every verification log, so the wallet's own submission appears to come from the verifier.

## 5. Visual design

The first version used the default "AI look": a dark theme, indigo/teal gradients, glows and coloured shadows, large radii, wide-tracked uppercase labels, a pulsing status dot, sparkle icons and six neon accent hues. Comparable credible tools do the opposite. [IBM Carbon](https://carbondesignsystem.com/elements/color/overview/) and [GitHub Primer](https://primer.style/foundations/color/overview) use neutral surfaces and a single interaction colour, and [GOV.UK](https://brand.design-system.service.gov.uk/colour/govuk-blue) forbids mixed-colour gradients.

The playground now follows MOSIP's own [Inji Verify](https://github.com/mosip/inji-verify) theme:
- a light `#fafbfd` / white canvas
- plum `#951f6f` as the only action colour
- Inji's green, amber and red reserved for status, each with an icon and text
- Inter for text, monospace only for data
- flat 1px-bordered panels with small radii, quiet colour transitions, and a visible plum focus outline

All colours come from tokens. The rules and sources are in [design-tokens.md](./design-tokens.md), and `frontend/src/test/design.test.ts` checks contrast and blocks the banned patterns in CI.

## 6. Verification

- Frontend unit, component and integration tests cover every new module (see [testing.md](./testing.md)).
- Screenshots at 1440px and 390px before and after each step; a keyboard-only pass through presets, replay and heatmap cells.
