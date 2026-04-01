# Proof Of Correctness

This document is the release gate for sponsor/demo claims. If an item here is pending or failed, ForgeX can still be reviewed, but it should not be represented as fully proven.

## Release Gate

| Gate item | Exact command or artifact | Expected result | What it proves | Failure meaning | Current status |
| --- | --- | --- | --- | --- | --- |
| Contract compile | `forge build` | Build completes with no compiler/import errors | Current Solidity and Foundry integration compile in the target shell | Contract layer is not yet verifiable in that environment | Passed on March 24, 2026 |
| Unit test suite | `forge test -vvv` | All unit and fuzz tests pass | Role, replay, pause, and write-path checks behave as expected | Contract logic or test harness remains unproven | Passed on March 24, 2026 |
| Invariant suite | `forge test --match-path test/ForgeXMessageVault.invariant.t.sol -vvv` | Invariant run completes without violation | Replay-related invariant behavior is stable under handler input | Safety property remains unproven | Passed on March 24, 2026 |
| Formatting | `forge fmt --check` | No diffs reported | Contract sources are normalized and reproducible | Repo is not normalized after Solidity changes | Passed on March 24, 2026 |
| Runtime audit | `npm run audit:system` | Outputs `ForgeX audit passed...` | Local-only auth, external prepared-run behavior, actionable failures, sanitized UI state | Active runtime proof regressed | Passed on March 24, 2026 |
| Malformed payload proof | Runtime audit plus dedicated malformed route corpus | Invalid input is rejected without chain mutation | Input handling claims are reviewable | Input safety claims are overstated | Partial; dedicated `/runs/*` corpus pending |
| Duplicate run proof | Dedicated idempotency capture | Same request envelope does not create an unintended second write | Duplicate-execution claim is proven, not just designed | Idempotency claim remains architectural only | Pending |
| Wrong-network proof | Dedicated chain-mismatch capture | Run fails before submission on chain mismatch | XRPL-specific chain guard is proven | Network-safety claim remains architectural only | Pending |
| Stream fallback proof | Dedicated UI/browser capture | Stream interruption falls back safely to static output | Operator is not stranded by transport failure | Transport-resilience claim remains architectural only | Pending |
| Crash/recovery proof | Dedicated interruption/reconciliation capture | No success is trusted without post-crash reconciliation | Recovery model is proven, not assumed | Recovery claim remains architectural only | Pending |

## Claim Status Table

| Claim | Evidence | Status | Notes |
| --- | --- | --- | --- |
| Backend is not the default signer | `backend/config.js`, `backend/signer.js`, runtime audit external-mode run | Verified for default path | Default signer mode is `external` and audit confirms prepared-run behavior |
| Local-only posture is enforced | `backend/auth.js`, `backend/server.js`, runtime audit | Verified | Sensitive routes remain local-only and session-gated |
| No generic arbitrary write relay exists in the active runtime | `backend/server.js`, `backend/run-engine.js`, `backend/signer.js` | Verified by route surface review | Active runtime only exposes typed actions |
| Success is not declared before receipt in non-test mode | `backend/run-engine.js`, runtime audit external-mode `prepared` behavior, recorded confirmed external deploy run | Verified for the active prepared/finalize flow | Backend does not declare confirmation before receipt; confirmed run now exists in the local run store |
| Chain readback is canonical for final write state | `backend/run-engine.js` | Partially verified | Implemented; live XRPL capture still pending |
| Duplicate envelopes reuse a single run record | `backend/run-engine.js`, `backend/run-store.js` | Pending dedicated capture | Implementation exists; no dedicated proof artifact yet |
| Wrong-network execution fails before submission | `backend/run-engine.js` | Pending dedicated capture | Implemented; negative-path capture still pending |
| On-chain replay is blocked | `test/ForgeXMessageVault.t.sol`, `test/ForgeXMessageVault.invariant.t.sol` | Verified | Proven by the March 24, 2026 Foundry rerun |

## Runtime Audit Checklist

| Check | Evidence | Status |
| --- | --- | --- |
| Local-only request enforcement | `npm run audit:system` | Passed |
| Local operator session bootstrap | `npm run audit:system` | Passed |
| External signer prepared-run behavior | `npm run audit:system` | Passed |
| Invalid command rejection | `npm run audit:system` | Passed |
| Sanitized UI-state persistence | `npm run audit:system` | Passed |

## Adversarial Test Checklist

| Scenario | Primary evidence | Status |
| --- | --- | --- |
| Duplicate run handling | `backend/run-engine.js`, `backend/run-store.js` | Pending dedicated capture |
| On-chain replay rejection | Foundry unit/invariant tests | Passed |
| Wrong-network rejection | `backend/run-engine.js` | Pending dedicated capture |
| Malformed payload handling | Runtime audit plus route behavior | Partial |
| Stream fallback | `frontend/app.js` | Pending dedicated capture |
| Crash/recovery reconciliation | `backend/run-engine.js`, `backend/run-store.js` | Pending dedicated capture |

## Contract Proof Matrix

| Property | Contract behavior | Proof artifact | Current status |
| --- | --- | --- | --- |
| Unauthorized writes always fail | `onlyRole(EXECUTOR_ROLE)` on `setMessage` | `testUnauthorizedCallerCannotSetMessage` | Passed on March 24, 2026 |
| Paused contract cannot mutate protected state | `whenNotPaused` on `setMessage` and registry functions | `testPauseBlocksWrites` | Passed on March 24, 2026 |
| Consumed `forgeRunDigest` cannot replay | `consumedRuns` guard and custom error | `testDuplicateForgeRunDigestReverts` | Passed on March 24, 2026 |
| Latest consumed digest remains marked consumed | `consumedRuns` mapping plus handler-driven writes | `invariant_LatestRunDigestIsConsumed` | Passed on March 24, 2026 |
| Registry cannot finalize same run twice | `ForgeXRunAlreadyFinalized` guard | No dedicated test captured yet | Pending dedicated negative-path test |
| Deployment registration cannot drift or alias unexpectedly | `ForgeXDeploymentAlreadyRegistered` guard | No dedicated test captured yet | Pending dedicated negative-path test |

## Known Gaps

| Gap | Why it matters |
| --- | --- |
| Dedicated duplicate-run capture missing | Idempotency claim remains implementation-first, not proof-first |
| Dedicated wrong-network capture missing | XRPL mismatch handling is not yet sponsor-demonstrated |
| Dedicated stream-fallback capture missing | UI transport resilience is not yet demonstrated end-to-end |
| Dedicated crash/recovery capture missing | Recovery claims remain architectural |
| No external audit | Independent review is still absent |
| No production track record | Operational maturity is still local/tooling-stage |

## Reviewer Fast Path

1. Read [SECURITY-MODEL.md](./SECURITY-MODEL.md).
2. Read [THREAT-MODEL.md](./THREAT-MODEL.md).
3. Run `npm run audit:system`.
4. Run the Foundry commands in [FOUNDRY-VERIFICATION.md](./FOUNDRY-VERIFICATION.md).
5. Use [DEMO-SCRIPT.md](./DEMO-SCRIPT.md) only after the release gate items needed for the demo are green.
