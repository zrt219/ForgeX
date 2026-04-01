# ForgeX
Local-first XRPL EVM execution console with typed `forgeRunId` runs, receipt-gated finalization, and an external-signer-first trust boundary.
The active architecture keeps the backend as orchestration and persistence, not the default signing root.

`XRPL EVM` · `Solidity` · `Contract` · `Foundry` · `MIT`

## Live Demo

- Local dashboard: `http://127.0.0.1:3000`
- Vercel preview: [forgexapp-zrt219s-projects.vercel.app](https://forgexapp-zrt219s-projects.vercel.app)
- Contract explorer link: [ForgeXMessageVault `0x170d...7d57`](https://explorer.testnet.xrplevm.org/address/0x170d2207bf76e11179aa491f958f10767b697d57)

## What This Is

ForgeX is a local operator console for XRPL EVM deploys and writes. It is not a hosted relay and it is not a generic backend that forwards arbitrary contract calls. The active runtime is deliberately constrained: each command becomes a typed run, the runtime persists that run durably, and final state is only considered real after receipt verification and chain readback.

The system is built to keep chain truth separate from UI convenience. That means the dashboard can prepare a deploy command, show logs, and help the operator reconcile a run, but it cannot invent a confirmed address or transaction hash. In practice, that is the difference between an operator console and a polished but misleading mockup.

There is no broad public API and no arbitrary write relay in the active runtime. The backend enforces local-only access, the signer boundary is explicit, and the contracts themselves enforce roles, pause state, replay protection, and deployment registration.

## Features

### Blockchain

- Deploys `ForgeXRegistry` and `ForgeXMessageVault` on XRPL EVM Testnet
- Tracks every deploy and write as a typed run with a `forgeRunId`
- Enforces role-based write access, pause control, and replay protection
- Registers deployments and finalized runs on-chain for auditability
- Treats receipts and chain readbacks as canonical truth

### Dashboard

- Runs locally on the operator machine with loopback-only access by default
- Shows prepared external-signer commands without pretending they are confirmed
- Unlocks explorer and contract actions only after confirmed on-chain state exists
- Persists run history and logs for recovery and review
- Keeps the visual UI unchanged while tightening truthfulness underneath

## Contract Section

### Current Deployment

| Item | Value |
| --- | --- |
| Contract name | `ForgeXMessageVault` |
| Registry | `ForgeXRegistry` |
| Vault address | `0x170d2207bf76e11179aa491f958f10767b697d57` |
| Registry address | `0x6f97d04b4856aa2782c21e31b14b316b580a6540` |
| Network | XRPL EVM Testnet |
| Chain ID | `1449000` |
| Compiler | Solidity `0.8.24` |
| Foundry | `1.6.0-dev` |

### Pipeline Stages

| ID | Stage | Product | Capacity |
| --- | --- | --- | --- |
| 1 | Accepted | Typed run envelope created | One canonical run record per request |
| 2 | Validated | Auth, schema, and chain preflight complete | Rejects malformed or unauthorized input |
| 3 | Simulated | RPC profile and chain ID confirmed | No chain mutation yet |
| 4 | Prepared | External Foundry command emitted | No confirmed tx hash yet |
| 5 | Broadcast Submitted | Tx hash known | Receipt still pending |
| 6 | Confirming | Receipt reconciliation in progress | Contract address not trusted until verified |
| 7 | Confirmed | Canonical on-chain deployment recorded | Explorer, copy, and read/write actions unlock |
| 8 | Failed | Error captured and persisted | Recovery path remains available |

### Write Functions

| Function | Purpose | Constraints | Events |
| --- | --- | --- | --- |
| `setMessage(string calldata newMessage, bytes32 forgeRunDigest)` | Update the vault message and bind the change to one logical run. | Requires `EXECUTOR_ROLE`, requires unpaused state, rejects empty strings, rejects replayed digests. | Emits `MessageUpdated`; also finalizes the run in the registry. |
| `registerDeployment(bytes32 deploymentId, address vault, address executor)` | Persist a deployment record for later audit and lookup. | Requires `EXECUTOR_ROLE`, rejects zero addresses, rejects duplicate deployment IDs, requires unpaused state. | Emits `DeploymentRegistered`. |
| `finalizeRun(bytes32 forgeRunDigest, bytes32 deploymentId, bytes32 actionHash, address target, address executor)` | Canonicalize a logical execution run against a deployment. | Requires `EXECUTOR_ROLE`, requires unpaused state, requires known deployment ID, rejects duplicate finalized runs. | Emits `RunFinalized`. |

### Read Functions

| Function | Return signature | Why it matters |
| --- | --- | --- |
| `getMessage()` | `returns (string memory)` | Returns the current on-chain message value. |
| `getDeploymentMeta()` | `returns (address adminAddress, uint256 deployedTimestamp, bytes32 registeredDeploymentId, address registryAddress)` | Returns deploy provenance and registry linkage. |
| `getDeployment(bytes32 deploymentId)` | `returns (DeploymentRecord memory)` | Reads the canonical deployment record from the registry. |
| `getRun(bytes32 forgeRunDigest)` | `returns (RunRecord memory)` | Reads the finalization record for a typed execution run. |

### Solidity Patterns

| Pattern | Status | Notes |
| --- | --- | --- |
| Custom errors | Used | Keeps revert paths cheap and explicit. |
| Indexed events | Used | Supports audit filtering and chain provenance. |
| Role-based access | Used | `DEFAULT_ADMIN_ROLE`, `EXECUTOR_ROLE`, `PAUSER_ROLE`. |
| `onlyOwner` | Not used | Role-based access is the active pattern instead of single-owner control. |
| Capacity enforcement | Used | Replay, duplicate registration, and paused-state violations all revert. |
| Immutable deployment identity | Used | `DEPLOYMENT_ID` binds a vault to chain and address. |
| Basis points | Not used | No pricing or fee-share math exists in the current contract surface. |

## Tech Stack

| Layer | Tool | Why it is here |
| --- | --- | --- |
| Chain | XRPL EVM Testnet | Target execution environment |
| Contracts | Solidity `0.8.24` | Registry + vault logic |
| Framework | Foundry | Build, test, deploy, cast |
| Runtime | Node.js + Express | Local operator console and session/auth layer |
| Persistence | SQLite | Durable run and deployment records |
| Frontend | Vanilla JS + CSS + SVG | Unchanged visual UI with stricter truth rules |
| CLI | ForgeX CLI | Local run initiation and inspection |
| Signer boundary | External Foundry signer or explicit dev signer | Keeps the backend from becoming the default wallet |

## Project Structure

```text
forgex/
â”œâ”€ backend/ -> auth, runtime, typed run engine, signer boundary, persistence
â”œâ”€ contracts/ -> ForgeXRegistry, ForgeXMessageVault, access control layer
â”œâ”€ frontend/ -> terminal UI, state rendering, log stream, operator actions
â”œâ”€ script/ -> Foundry deploy script for registry + vault + registration
â”œâ”€ test/ -> unit tests and invariant coverage
â”œâ”€ docs/ -> security, threat, operations, proof, and case-study material
â”œâ”€ broadcast/ -> Foundry broadcast artifacts for reconciliation
â”œâ”€ state/ -> SQLite-backed run store and UI runtime state
â””â”€ cli/ -> local command-line entrypoint
```

## Running Locally

The frontend is served by the backend, so there is no separate frontend install step.

### PowerShell

```powershell
cd "C:\Users\Zhane\Documents\New project\forgex"
npm install
Copy-Item .env.example .env
npm run start
```

### WSL

```bash
cd "/mnt/c/Users/Zhane/Documents/New project/forgex"
npm install
cp .env.example .env
npm run start
```

Open:

```text
http://127.0.0.1:3000
```

## Build & Test

```bash
npm run audit:system
forge build
forge test -vvv
forge test --match-path test/ForgeXMessageVault.invariant.t.sol -vvv
forge fmt --check
forge snapshot
```

`forge test -vvv` covers the unit and fuzz paths. `forge snapshot` gives a stable baseline for gas and bytecode drift.

## Deploy Section

ForgeX's active deploy path uses `forge script` because the registry, vault, role grant, and deployment registration are one atomic sequence. `forge create` is not the active production path for this repo.

### Reset Before Deploy

### PowerShell

```powershell
Remove-Item -Recurse -Force out, cache, broadcast
```

### WSL

```bash
rm -rf out cache broadcast
```

### Dev-Signer Flow

Use this if you want ForgeX to deploy directly from a local test key.

### PowerShell

```powershell
$env:PRIVATE_KEY="0xYOUR_TESTNET_PRIVATE_KEY"
forge script script/Deploy.s.sol:DeployScript --rpc-url https://rpc.testnet.xrplevm.org --broadcast --legacy
```

### External-Signer Flow

Use this if you want Foundry to sign locally with a keystore alias.

```powershell
forge script script/Deploy.s.sol:DeployScript --rpc-url https://rpc.testnet.xrplevm.org --broadcast --account forgex-local --sender 0x31A826bB9D5F6087d94CDA31945C1234d061b788 --legacy
```

### Frontend Wiring

After deploy:

1. Start ForgeX with `npm run start`.
2. Open `http://127.0.0.1:3000`.
3. For `dev-private-key`, the run should finalize directly.
4. For `external`, paste the vault deployment tx hash or import the Foundry broadcast file.
5. Confirm the dashboard unlocks only after the chain-reconciled state is known.

### Surge Deploy

Surge is not part of the active trust model. ForgeX is local-first, so the authoritative runtime stays on the operator machine.

## MetaMask Config

| Field | Value | Notes |
| --- | --- | --- |
| Network name | XRPL EVM Testnet | Use a clear local label in MetaMask |
| RPC URL | `https://rpc.testnet.xrplevm.org` | Must match runtime preflight |
| Chain ID | `1449000` | Hard requirement |
| Currency symbol | `XRP` | Wallet display only |
| Explorer URL | `https://explorer.testnet.xrplevm.org` | Used for tx/address inspection |
| Transaction mode | Legacy | Current deploy path uses `--legacy` |
| Sender address | `0x31A826bB9D5F6087d94CDA31945C1234d061b788` | Example configured signer address |

## XRPL EVM Known Issues

- `eth_estimateGas` can be noisy or misleading on some flows, so Foundry broadcast output should be treated as advisory until confirmed on-chain.
- `eth_gasPrice` can drift from what the operator expects, so the deploy path should keep explicit fee headroom.
- `--legacy` is required for the current testnet flow used by ForgeX.
- Stale `out/`, `cache/`, or `broadcast/` artifacts can mislead reconciliation if they are not cleaned before a fresh deploy.
- JS falsy handling matters: `null`, `""`, and `0` must not be treated as confirmed chain truth in the UI.
- Underpriced transactions can fail; current successful deploy output showed an effective price around `137.5 gwei`, so fee headroom should not be guessed downward.

## Cast Commands

Set your variables first:

```bash
export CONTRACT=0x170d2207bf76e11179aa491f958f10767b697d57
export RPC=https://rpc.testnet.xrplevm.org
```

Current ForgeX read surface:

```bash
cast call $CONTRACT "getMessage()(string)" --rpc-url $RPC
cast call $CONTRACT "getDeploymentMeta()(address,uint256,bytes32,address)" --rpc-url $RPC
cast call $CONTRACT "latestForgeRunDigest()(bytes32)" --rpc-url $RPC
cast call $CONTRACT "consumedRuns(bytes32)(bool)" --rpc-url $RPC
cast call $CONTRACT "getDeployment(bytes32)(address,address,uint64,bool)" --rpc-url $RPC
cast call $CONTRACT "getRun(bytes32)(bytes32,bytes32,address,address,uint64,bool)" --rpc-url $RPC
```

Current ForgeX write surface:

```bash
cast send $CONTRACT "setMessage(string,bytes32)" "hello xrpl" 0xYOUR_RUN_DIGEST --rpc-url $RPC --legacy
```

Legacy stage/batch commands like `getStage`, `batchCount`, `injectBatch`, and `advanceBatch` are not part of the current ForgeX contract surface.

## On-Chain Systems Portfolio

| Project | Description | Status |
|---------|-------------|--------|
| **[ZUC Mine Command Center](https://github.com/zrt219/Zuc-Mine-Command-Center)** | On-chain uranium mining operations dashboard — real-time reserve tracking, miner registry, and contract interaction via a fully frontend-driven command interface | ✅ Live |
| **[U235 Fuel Cycle](https://github.com/zrt219/-U235-Fuel-Cycle-)** | Nuclear fuel cycle pipeline — uranium ore to enriched fuel rod, deterministic multi-stage processing with full on-chain traceability | ✅ Live |
| **[ISR Network](https://github.com/zrt219/ISR-Network)** | Intelligence surveillance reconnaissance system — on-chain asset tracking, mission lifecycle state machine, and role-based operator control | ✅ Live |
| **[Dark Matter Farm](https://github.com/zrt219/Dark-Matter-Farm)** | DeFi yield protocol — experimental high-convexity farming system with custom reward mechanics and on-chain state-driven emissions | ✅ Live |
---

## License

MIT — see [LICENSE](LICENSE)

