# Sponsor Brief

## What ForgeX Is

ForgeX is a local-first XRPL EVM execution framework for deterministic deploy and write flows from an operator's own machine. It preserves Foundry and terminal workflows while moving the most dangerous trust assumptions out of the backend.

## Product Definition

ForgeX is:
- a local operator console
- a typed run engine with `forgeRunId`
- an external-signer-first execution surface
- a role-constrained contract package
- a proof-oriented repository with explicit gates

ForgeX is not:
- a hosted relay
- a multi-user SaaS platform
- a backend-wallet-first execution service
- a claim of trustlessness or perfect security

## Current Version Position

- current baseline: `2.0.0`
- meaning: secure architecture reset completed
- next target: `2.1.0 - Proof Release`
- major threshold: `3.0.0 - Audited Mainnet Readiness`

Authoritative roadmap: [VERSIONS.md](./VERSIONS.md)

## Trust Model Summary

- Backend is orchestration, not the normal signing root.
- External signer is the default authority boundary.
- Receipts and chain readbacks are canonical truth.
- Cached state exists for recovery and operator visibility only.

## Risks Already Closed

- Public generic write relay path removed from active runtime
- Loopback-only backend posture added
- Local operator session added
- Typed run and idempotency architecture added
- Contract roles, pause, replay guards, and registry-based tracking added
- Caller-supplied production RPC override removed from active runtime

## What Remains Intentionally Constrained

- Local-first posture only
- Single-operator trust model
- Dev signer remains available only as an explicit lower-trust fallback
- Sponsor claims remain blocked until proof gate items are captured

## What Is Proven Now

- Runtime audit passes in the current workspace
- Default external-signer prepared/finalize behavior is verified
- Local-only session gating is verified
- Real Foundry build, unit tests, invariant run, and formatting check all pass
- Active runtime no longer depends on the deleted legacy execution path

## What Is Still Pending

- Dedicated duplicate-run proof
- Dedicated wrong-network proof
- Dedicated stream-fallback proof
- Dedicated crash and recovery proof
- External audit
- Production operating history

## Why Local-First Matters

- It reduces remote attack surface.
- It keeps signer authority with the operator.
- It avoids pretending a local tool is already hosted-grade infrastructure.

## Why External Signer Matters

- It prevents the backend from silently becoming the default trust root.
- It makes deploy and write authorization explicit.
- It aligns better with wallet and infrastructure review expectations.

## Adoption Path

1. Complete the remaining `2.1.0` proof gate items.
2. Ship `2.1.0` as the proof-release milestone.
3. Use the sponsor demo to show local-safe XRPL deploy and write behavior.
4. Move intentionally through the roadmap:
   - `2.2.0` for operator reliability
   - `2.3.0` for signer-boundary expansion
   - `2.4.0` for XRPL ecosystem readiness
5. Pursue external audit and mainnet-grade readiness toward `3.0.0`.
6. Use that package for serious ecosystem conversations.

## Proof Artifacts

- [SECURITY-MODEL.md](./SECURITY-MODEL.md)
- [THREAT-MODEL.md](./THREAT-MODEL.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [PROOF-OF-CORRECTNESS.md](./PROOF-OF-CORRECTNESS.md)
- [XRPL-READINESS.md](./XRPL-READINESS.md)
- [DEMO-SCRIPT.md](./DEMO-SCRIPT.md)
- [VERSIONS.md](./VERSIONS.md)

## Explicit Limitations

ForgeX is not yet externally audited, not yet production-proven, and not yet entitled to claims beyond the evidence captured in the current proof bundle.
