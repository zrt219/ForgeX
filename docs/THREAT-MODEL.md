# Threat Model

This document names the attacker classes, trusted boundaries, mitigations, and residual risks for the active ForgeX architecture.

## Attacker Profiles

| Attacker | Goal | Relevance |
| --- | --- | --- |
| Remote network client | Reach the runtime over HTTP and trigger deploy/write actions | Reduced by loopback-only posture |
| Malicious local web content | Abuse a localhost browser session | Relevant because the UI runs in a browser |
| Malformed local input | Trigger inconsistent runs, unsafe parsing, or fake success | Relevant to UI and CLI entrypoints |
| Wrong or stale RPC | Cause wrong-network assumptions or stale receipt/state reads | Relevant to XRPL EVM connectivity |
| Replay or duplicate actor | Repeat the same run or on-chain digest | Relevant to typed runs and contract writes |
| Misconfigured local operator | Start in the wrong signer mode, wrong RPC, or wrong env | High-probability operational risk |
| Dependency/runtime mismatch | Break persistence or proof paths through Node/Foundry differences | Relevant because local environments vary |

## Trusted Boundaries

- Local operator on the same machine
- External signer in normal mode
- Confirmed XRPL receipt data
- Post-confirmation chain readback
- Active backend code path in:
  - `backend/server.js`
  - `backend/run-engine.js`
  - `backend/run-store.js`
  - `backend/signer.js`

Everything else is treated as untrusted input, cached state, or lower-trust exception mode.

## Attack Surfaces

| Surface | Main risk | Current posture |
| --- | --- | --- |
| HTTP routes | Unauthorized local or proxied use | Loopback-only plus session-gated for sensitive routes |
| NDJSON/SSE transport | Stream interruption or stale operator view | Stream is convenience only; static fallback exists |
| Signer modes | Silent drift back to backend-wallet trust | External is default; dev/test paths are explicit |
| XRPL RPC | Wrong network, stale reads, unreliable confirmations | Chain ID preflight and receipt/readback reconciliation |
| Run store | Treating cached state as chain truth | Durable state only; chain remains canonical |
| Contracts | Unauthorized mutation, replay, role abuse | Role-constrained registry and vault |
| Foundry toolchain | Missing binaries or inconsistent vendoring | Preflight checks; core Foundry proof is now captured |

## Mitigations

| Threat | Mitigation |
| --- | --- |
| Remote backend abuse | `requireLocalRequest` enforces localhost-only secure mode |
| Sessionless route access | Sensitive routes require a local operator session token |
| Arbitrary contract write relay | Removed from the active runtime; typed actions only |
| Caller-supplied RPC override | Not accepted in the active runtime |
| Duplicate application runs | Idempotency key plus request-hash lookup in the run store |
| On-chain replay | `ForgeXRunAlreadyApplied` and `ForgeXRunAlreadyFinalized` logic |
| False success | Non-test deploy/write success requires receipt confirmation |
| Wrong network | `eth_chainId` preflight against configured XRPL chain ID |
| UI dead ends | Static fallback path and CLI fallback guidance |

## Residual Risks

| Risk | Why it remains |
| --- | --- |
| Local operator compromise | The system is intentionally local-first, so operator compromise remains high impact |
| External signer misuse | Correctness of the operator-selected signer remains trusted in normal mode |
| Dev signer misuse | Explicitly enabling `dev-private-key` lowers the trust bar |
| Pending hostile-path capture | Duplicate-run, wrong-network, stream-fallback, and crash-recovery proof still need dedicated capture |
| No external audit | No third-party security review exists yet |
| No production history | No long-lived operational track record exists yet |

## Operator Error Risk

High-probability mistakes:
- starting in `dev-private-key` when sponsor/demo posture expects `external`
- pointing `XRPL_RPC_URL` at the wrong network
- treating `prepared` as success
- assuming cached deployment data is canonical without checking chain readback

Recovery discipline is documented in [OPERATIONS.md](./OPERATIONS.md).

## Dependency Risk

- Foundry must exist on `PATH` in the shell used for proof capture.
- The repo currently vendors a minimal `forge-std` stub; recent test fixes reduce reliance on missing test helpers, but the full Foundry rerun is still required.
- Node runtime differences matter. `backend/run-store.js` supports a durable fallback when `node:sqlite` is unavailable, but reviewer proof should still record the actual environment used.

## Dev/Test-Only Exceptions

| Exception | Boundary |
| --- | --- |
| `dev-private-key` signer | Explicit local-only fallback, not sponsor-grade |
| `FORGEX_TEST_MODE=1` | Test-only mode |
| `FORGEX_DEV_ASSUME_RECEIPT=1` | Ignored unless `FORGEX_TEST_MODE=1` is also enabled |

## Intentionally Out Of Scope

- Hosted multi-user relay security
- Remote wallet delegation workflows
- Hardware-wallet or multisig integrations
- Audit claims not backed by captured artifacts
