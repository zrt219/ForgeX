# Foundry Verification

This file tracks the required contract proof commands and their current status.

## Commands To Run

Run these in WSL or another shell where `forge` is installed and visible on `PATH`:

```bash
forge build
forge test -vvv
forge test --match-path test/ForgeXMessageVault.invariant.t.sol -vvv
forge fmt --check
```

## What To Capture

Capture the raw terminal output for:
- build
- unit test suite
- invariant suite
- formatting check

Store the captured output in this file or a linked validation artifact before changing the status in `PROOF-OF-CORRECTNESS.md`.

## Pass Criteria

| Command | Pass means |
| --- | --- |
| `forge build` | No import, compiler, or linkage errors |
| `forge test -vvv` | All unit and fuzz tests pass |
| `forge test --match-path ...` | Invariant run completes without violation |
| `forge fmt --check` | No formatting diff remains |

## Failure Interpretation

- Build failure means the contract layer is not yet verifiable in the target shell.
- Test failure means the contract safety claims are not yet proven.
- Formatting failure means the Solidity source set is not normalized.

## Current Status

Passed on March 24, 2026 using:
- `forge Version: 1.6.0-dev`
- binary path: `C:\Users\Zhane\.cargo\bin\forge.exe`

Captured results:
- `forge build`: passed
- `forge test -vvv`: passed, 6 tests passed, 0 failed
- `forge test --match-path test/ForgeXMessageVault.invariant.t.sol -vvv`: passed, invariant run green
- `forge fmt --check`: passed

Contract proof is no longer the active blocker for sponsor/demo posture.
