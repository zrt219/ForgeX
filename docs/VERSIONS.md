# ForgeX Versions

ForgeX uses strict Semantic Versioning from the current `2.0.0` baseline onward.

This file is the authoritative source of truth for version meaning, release gates, and future targets. Marketing, release notes, sponsor copy, and roadmap language must follow this document.

## Versioning Policy

| Version type | Meaning for ForgeX |
| --- | --- |
| `MAJOR` | Trust model, deployment stage, or architecture threshold shift |
| `MINOR` | Meaningful new capability, signer-boundary expansion, proof milestone, or compliance bundle |
| `PATCH` | Bug fixes, proof-doc refreshes, lint/test cleanup, release-note corrections, and non-architectural hardening |

## Current Baseline: `2.0.0`

`2.0.0` means:
- the unsafe backend-signer demo model is over
- the local-first secure architecture baseline is in place
- external-signer-first is the default posture
- core runtime proof is complete
- core Foundry proof is complete

`2.0.0` does not mean:
- hostile-path proof is complete
- external audit exists
- production operating history exists
- audited mainnet-grade posture is claimed

Remaining gaps after `2.0.0`:
- duplicate-run capture
- wrong-network capture
- stream-fallback capture
- crash/recovery capture
- external audit
- production history

## Stabilization Line: `2.0.x`

`2.0.x` is the stabilization line.

Allowed scope:
- contract, test, or lint fixes
- proof bundle consistency fixes
- operator guidance corrections
- release-gate wording updates
- non-breaking safety cleanup

Not a `2.0.x` change:
- new major signer support
- new deployment-stage claims
- proof-bundle milestone closure
- new version-theme milestone announcement

Examples of `2.0.x` work:
- lint-driven Solidity cleanup
- proof document corrections
- release-note corrections
- non-breaking runtime hardening

## Next Target: `2.1.0 - Proof Release`

`2.1.0` is the next planned version.

It must include:
- duplicate-run capture
- wrong-network capture
- stream-fallback capture
- crash/recovery capture
- release gate moved from partially pending to substantially green except audit and production history

The point of `2.1.0` is not more product surface. The point is moving ForgeX from "architecturally credible" to "proof-backed enough for serious sponsor review."

## Future Version Ladder

### `2.2.0 - Operator Reliability Release`

Must include:
- stronger local diagnostics
- better run inspection and history UX without changing the UI visual design
- cleaner recovery workflows
- explicit captured negative-path tests for remaining contract gaps, including:
  - registry duplicate finalization
  - deployment registration drift or aliasing

### `2.3.0 - Signer Boundary Expansion`

Must include:
- stronger signer adapter support
- clearer signer-mode evidence
- stronger separation between sponsor-grade and dev-grade paths
- no regression from external-signer-first posture

### `2.4.0 - XRPL Ecosystem Readiness`

Must include:
- stronger XRPL-specific validation artifacts
- demo-quality ecosystem review package
- hardened release discipline
- stronger reviewer self-validation flow

### `2.5.0+`

Reserved for deliberate capability expansion that does not break the local-first trust model.

Examples:
- more contract templates
- stronger deployment manifesting
- structured execution or export artifacts

## Major Threshold: `3.0.0 - Audited Mainnet Readiness`

`3.0.0` is reserved for Audit plus Mainnet.

It requires:
- external audit completed
- mature proof bundle
- explicit mainnet-grade posture
- sponsor and integration story no longer limited to "strong local tool"

`3.0.0` is not earned by feature count alone.

## Release Gates By Version Class

### Patch Release Gate

Required:
- `npm run audit:system`
- `forge build`
- `forge test -vvv`
- `forge fmt --check`
- docs and version notes updated

Patch releases must not claim a new proof milestone.

### Minor Release Gate

Required:
- everything in the patch gate
- all hostile-path captures required for that release theme
- updated proof bundle
- updated demo script
- updated sponsor brief

Minor releases may change the credibility story, but only when the proof artifacts for that change exist.

### Major Release Gate

Required:
- everything in the minor gate
- external audit evidence
- deployment-stage decision documented
- explicit migration and adoption note
- release announcement aligned with actual proof

Major releases change the trust or deployment-stage story. They cannot be claimed on architecture aesthetics alone.

## Naming Rules

- Version numbers are canonical.
- Themed subtitles are optional labels.
- Themed subtitles never replace the version number.

Examples:
- `ForgeX 2.1.0 - Proof Release`
- `ForgeX 2.2.0 - Operator Reliability`
- `ForgeX 2.3.0 - Signer Boundary Expansion`
- `ForgeX 3.0.0 - Audited Mainnet Readiness`

## Communication Rules

- Never present a version as more mature than its release gate allows.
- Marketing is downstream from proof, not the other way around.
- If hostile-path capture, audit, or production history is missing, release copy must not imply those things are complete.
- If a release is still on the `2.0.x` line, treat it as stabilization, not a new maturity milestone.
