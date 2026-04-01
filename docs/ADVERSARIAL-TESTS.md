# Adversarial Tests

This file records the hostile or failure-oriented scenarios that matter to sponsor review. It separates what is already verified from what is implemented but still pending a dedicated captured proof.

## Status Table

| Scenario | Expected outcome | Current proof reference | Current status |
| --- | --- | --- | --- |
| Duplicate run submission | Same idempotency envelope reuses the same run record; no unintended second write | `backend/run-engine.js`, `backend/run-store.js` | Pending dedicated capture |
| Replay attempt | Reused `forgeRunDigest` reverts and state stays unchanged | `test/ForgeXMessageVault.t.sol`, `test/ForgeXMessageVault.invariant.t.sol` | Passed |
| Wrong-network rejection | Run fails before submission when `eth_chainId` does not match configured XRPL chain ID | `backend/run-engine.js` | Pending dedicated capture |
| Malformed payload rejection | Clear rejection, no chain mutation, actionable fix steps | `backend/system-audit.js`, `backend/server.js` | Partially verified |
| Stream failure fallback | UI falls back from `/ai` NDJSON to `/api/command` safely | `frontend/app.js` | Pending dedicated capture |
| Crash/recovery reconciliation | No success trusted until tx hash reconciles against chain | `backend/run-engine.js`, `backend/run-store.js` | Pending dedicated capture |

## Duplicate Run Test

- Threat: duplicate clicks or duplicate CLI requests create more than one write.
- What it proves: the application-level idempotency layer is working.
- Expected outcome:
  - identical `actorId + idempotencyKey + requestHash` resolves to the same run
  - no second write is intentionally created by the active runtime
- Current status: pending dedicated capture.
- Proof gap: there is implementation support in the run engine and store, but no captured sponsor-grade test artifact yet.

## Replay Test

- Threat: a previously used `forgeRunDigest` is reused against the vault.
- What it proves: on-chain replay protection works even if the runtime is bypassed.
- Expected outcome:
  - `ForgeXMessageVault.setMessage` reverts with `ForgeXRunAlreadyApplied`
  - registry finalization for the same digest cannot succeed twice
- Current status: passed in the March 24, 2026 Foundry rerun.
- Proof reference:
  - `testDuplicateForgeRunDigestReverts` in `test/ForgeXMessageVault.t.sol`
  - `invariant_LatestRunDigestIsConsumed` in `test/ForgeXMessageVault.invariant.t.sol`

## Wrong-Network Rejection Test

- Threat: operator or environment points ForgeX at a non-XRPL chain.
- What it proves: wrong-network writes fail before submission.
- Expected outcome:
  - chain preflight detects mismatched `eth_chainId`
  - run fails before deploy/write submission
  - no tx hash is recorded for a submitted write
- Current status: pending dedicated capture.

## Malformed Payload Test

- Threat: malformed browser or CLI payload causes undefined behavior.
- What it proves: invalid input is rejected clearly instead of mutating chain state.
- Expected outcome:
  - invalid command returns an actionable error
  - sanitized UI-state route ignores unrecognized fields
  - no chain mutation occurs
- Current status: partially verified.
- Current proof:
  - `npm run audit:system` verifies invalid command rejection
  - `npm run audit:system` verifies `/state/ui` sanitization
- Remaining gap: no dedicated malformed `/runs/*` negative corpus is captured yet.

## Stream Failure Fallback Test

- Threat: NDJSON stream fails mid-run and leaves the operator at a dead end.
- What it proves: UI transport failure does not become execution ambiguity.
- Expected outcome:
  - UI logs stream failure
  - client falls back to `/api/command`
  - operator still receives a safe result or actionable failure
- Current status: pending dedicated capture.
- Current implementation reference: `frontend/app.js`

## Crash / Recovery Reconciliation Test

- Threat: runtime stops after submission but before final reporting.
- What it proves: ForgeX does not invent success from partial local state.
- Expected outcome:
  - operator trusts tx hash plus chain reconciliation, not partial UI state
  - final status resolves to `finalized` or `failed` after reconciliation
- Current status: pending dedicated capture.
- Current implementation reference: `backend/run-engine.js` and durable run store behavior.

## What Failure Containment Means

Failure containment in ForgeX means:
- a malformed request does not become an arbitrary contract write
- a wrong network does not become a submitted write on the wrong chain
- a replay attempt does not mutate state twice
- a stream failure does not strand the operator without a fallback
- a crash does not let cached local state outrank chain truth

## Proof References

- Runtime proof: `npm run audit:system`
- Contract proof: `forge test -vvv`
- Invariant proof: `forge test --match-path test/ForgeXMessageVault.invariant.t.sol -vvv`
- Gate status: [PROOF-OF-CORRECTNESS.md](./PROOF-OF-CORRECTNESS.md)
