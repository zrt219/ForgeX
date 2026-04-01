# Operations

This runbook is for a local operator running ForgeX from GitHub on a personal machine.

## Validate It Yourself In Under 10 Minutes

```bash
npm install
cp .env.example .env
npm run audit:system
forge build
forge test -vvv
forge test --match-path test/ForgeXMessageVault.invariant.t.sol -vvv
forge fmt --check
npm run start
```

Then confirm:
1. ForgeX binds to `127.0.0.1`.
2. The browser can obtain a local operator session from `/api/session`.
3. Startup logs show the signer mode.
4. A deploy or write returns a `forgeRunId`.
5. Final success, if any, includes `txHash`, contract address, and chain-derived output.

## Startup Checks

| Check | Command or signal | Expected result |
| --- | --- | --- |
| Local bind | startup log or `curl http://127.0.0.1:3000/api/health` | Responds locally; not intended for remote access |
| Session bootstrap | `/api/session` | Returns a local operator session token |
| Signer mode | startup log | `external` for sponsor-grade posture |
| External signer identity | `.env` values `FORGEX_EXTERNAL_ACCOUNT_ALIAS` and `FORGEX_EXTERNAL_SENDER_ADDRESS` | Prepared commands are runnable without manual placeholder edits |
| Foundry | `forge --version` and `cast --version` | Both commands exist in the active shell |
| XRPL RPC | preflight in deploy/write path | Chain ID matches configured XRPL EVM |

## Signer Modes

| Mode | Intended use | Operator rule |
| --- | --- | --- |
| `external` | Default demos, review, serious local usage | Preferred mode |
| `dev-private-key` | Intentional local development fallback | Only use when explicitly required |
| `test` | Audit harness and test fixtures | Never use as sponsor proof |

Unsafe combinations:
- `FORGEX_SIGNER_MODE=dev-private-key` without explicitly intending lower trust
- `FORGEX_DEV_ASSUME_RECEIPT=1` outside `FORGEX_TEST_MODE=1`
- non-loopback host exposure

## Standard Local Operator Flow

1. Start ForgeX locally.
2. Confirm signer mode and local-only posture from startup logs.
3. Submit a typed run from UI or CLI.
4. Record the `forgeRunId`.
5. If the run is `prepared`, execute the prepared command with the external signer.
   If the command still shows `<foundry-account-alias>` or `<operator-address>`, set `FORGEX_EXTERNAL_ACCOUNT_ALIAS` and `FORGEX_EXTERNAL_SENDER_ADDRESS` in `.env` first, then restart ForgeX.
6. Track `txHash`.
7. Wait for finalization.
8. Confirm final state from chain readback, not cached UI state.

## Duplicate Run Handling

- Same idempotency envelope should resolve to the same run record.
- If the operator suspects a duplicate request:
  - inspect the original `forgeRunId`
  - inspect the saved `txHash`
  - do not submit a second manual write unless chain readback proves the first did not land

## Failure Investigation

| Symptom | First action | Trust boundary rule |
| --- | --- | --- |
| `prepared` persists | Check whether the operator has finalized or imported the external deploy | Prepared run is not success |
| Stream interruption | Use static `/api/command` fallback or CLI | Transport is not canonical truth |
| Unknown command rejection | Use a supported typed command | Invalid input must not mutate chain state |
| Wrong-network error | Fix `XRPL_RPC_URL` or `XRPL_CHAIN_ID` | Do not retry blindly |
| Missing Foundry binary | Fix shell `PATH` or tool install | Do not bypass preflight |

## Crash / Restart Recovery

If the runtime stops mid-flow:
1. Restart ForgeX locally.
2. Inspect the existing `forgeRunId` if known.
3. If a `txHash` exists, reconcile against chain receipt and readback.
4. Do not trust partial UI status from before the crash.
5. If there is no `txHash`, treat the run as not proven and restart deliberately.

Crash recovery is a release-gate item and still requires dedicated captured proof before sponsor claims.

## Local-Only Operating Assumptions

- ForgeX is intended to run on the operator's own machine.
- Sensitive routes assume loopback-only access.
- Browser, CLI, and runtime all operate within that local trust boundary.
- This runbook does not describe a hosted or shared-operator deployment model.

## Unsafe-Mode Warnings

- Do not use `dev-private-key` as sponsor-grade posture.
- Do not use `FORGEX_TEST_MODE=1` for real operator proof.
- Do not expose the runtime beyond localhost.
- Do not treat run-store state or UI state as canonical over confirmed chain data.

## Upgrade / Cleanup Rules

- The active execution architecture is the typed run engine.
- Legacy unsafe execution files are removed from the active repo surface.
- Historical trust-model discussion belongs in docs, not executable runtime code.
