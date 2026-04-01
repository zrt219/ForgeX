# ForgeX Publish Checklist

## Patch Release Gate

- [ ] Run `npm run audit:system`
- [ ] Run `forge build`
- [ ] Run `forge test -vvv`
- [ ] Run `forge fmt --check`
- [ ] Confirm docs and version notes are updated
- [ ] Confirm release copy does not claim a new proof milestone

## Minor Release Gate

- [ ] Everything in patch release gate is green
- [ ] Capture all hostile-path proofs required for the release theme
- [ ] Update `docs/PROOF-OF-CORRECTNESS.md`
- [ ] Update `docs/DEMO-SCRIPT.md`
- [ ] Update `docs/SPONSOR-BRIEF.md`
- [ ] Confirm `docs/VERSIONS.md` matches the release theme and gate
- [ ] Confirm release copy states what is proven and what is still pending

## Major Release Gate

- [ ] Everything in minor release gate is green
- [ ] External audit evidence is present
- [ ] Deployment-stage decision is documented
- [ ] Migration and adoption note is written
- [ ] Release copy matches actual proof status
- [ ] Mainnet-grade readiness claim is backed by `docs/VERSIONS.md` and proof artifacts

## Final Verification

- [ ] Run `npm run audit:system`
- [ ] Run `npm run benchmark:perf`
- [ ] Run final WSL golden-path tests
- [ ] Verify external-signer path reaches `awaiting_signature`
- [ ] Verify deploy and write flow reaches confirmed receipt and readback where applicable
- [ ] Verify `get value`
- [ ] Verify `set value <message>`
- [ ] Verify typed run inspection
- [ ] Verify explorer handoff
- [ ] Verify background switcher, drag, and resize

## Package + Repo

- [ ] Confirm `package.json` name, version, and bin are correct
- [ ] Confirm README and `docs/VERSIONS.md` agree on current and next version
- [ ] Confirm sponsor brief and GitHub release agree on current version meaning
- [ ] Confirm no broken image links in README
- [ ] Confirm missing media appears only as insertion markers
- [ ] Confirm release notes are ready
- [ ] Confirm release title matches current version meaning

## Launch Content

- [ ] Confirm `marketing/POST-COPY.md` is final
- [ ] Confirm `marketing/GITHUB-RELEASE.md` is final
- [ ] Confirm launch assets are captured or fallback assets are chosen
- [ ] Confirm Beacons copy and update are ready
- [ ] Confirm Discord announcement copy is ready
- [ ] Confirm X posts are ready
- [ ] Confirm Instagram caption and asset are ready

## Launch-Day Order

- [ ] Publish GitHub release
- [ ] Push X launch post
- [ ] Post Discord launch announcement
- [ ] Update Beacons
- [ ] Monitor replies, stars, and screenshots
- [ ] Post Day +1 follow-up assets on schedule
