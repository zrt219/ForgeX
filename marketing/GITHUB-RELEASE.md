# ForgeX Release

## Release Title

`ForgeX 2.0.0 - Secure Architecture Baseline`

## Summary

ForgeX 2.0.0 is the release where ForgeX stopped being an unsafe backend-signer demo and became a local-first XRPL EVM execution framework with explicit trust boundaries, external-signer-first posture, typed `forgeRunId` runs, and a real proof bundle.

## Key Highlights

- Local-only runtime by default
- External signer is the default authority boundary
- Real Foundry-backed XRPL path
- Typed run tracking with `forgeRunId`
- Sponsor-grade proof bundle and release gate
- Unchanged visual UI

## Version Meaning

`2.0.0` means:
- secure architecture baseline is complete
- core runtime proof is complete
- core Foundry proof is complete
- hostile-path capture, audit, and production history are still pending

Next planned version:

`ForgeX 2.1.0 - Proof Release`

Authoritative version policy:

- [docs/VERSIONS.md](../docs/VERSIONS.md)

## Install / Run

```bash
npm install
npm run start
```

For proof validation:

```bash
forge build
forge test -vvv
forge fmt --check
npm run audit:system
```

## README Links

- [Repo Overview](../README.md)
- [Proof Bundle](../docs/PROOF-OF-CORRECTNESS.md)
- [Security Model](../docs/SECURITY-MODEL.md)
- [Version Policy](../docs/VERSIONS.md)
- [Sponsor Brief](../docs/SPONSOR-BRIEF.md)

## Release Asset

Use:

- `frontend/assets/forgex-preview.svg`

Preferred future replacement:

- `docs/media/hero-terminal.png`
