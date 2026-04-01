# Legacy Status

ForgeX now has one active execution architecture.

## Removed From The Active Repo Surface

- `backend/operations.js`
- old AI command routing
- old AI preload state
- old generated executive-brief source that encoded stale live-deployment claims

## Authoritative Runtime Path

- `backend/server.js`
- `backend/run-engine.js`
- `backend/run-store.js`
- `backend/signer.js`
- `contracts/ForgeXAccessManaged.sol`
- `contracts/ForgeXRegistry.sol`
- `contracts/ForgeXMessageVault.sol`

## Reviewer Guidance

- Judge ForgeX by the active runtime path and proof docs.
- Treat historical trust-model discussion as documentation background only.
- There is no second executable backend architecture left in the repo to compare against.
