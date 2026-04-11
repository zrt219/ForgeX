# ForgeX Launch Instructions

This is the simple version.

If you just want to open ForgeX and make it work, do these steps in order.

## 1. Open the project folder

### PowerShell

```powershell
cd "$env:USERPROFILE\Documents\New project\forgex"
```

### WSL

```bash
cd "/mnt/c/Users/<YOUR_WINDOWS_USER>/Documents/New project/forgex"
```

If you are not inside the ForgeX folder, commands like `forge script script/Deploy.s.sol:DeployScript` will fail.

## 2. Install packages

### PowerShell

```powershell
npm install
```

### WSL

```bash
npm install
```

## 3. Create your `.env`

If `.env` does not exist yet:

### PowerShell

```powershell
Copy-Item .env.example .env
```

### WSL

```bash
cp .env.example .env
```

## 4. Pick your signer mode

ForgeX has 2 normal ways to run.

### Option A — Easiest: local dev signer

Use this if you want ForgeX to just send the deployment itself.

This is lower-trust local dev mode.

Set this in `.env`:

```env
FORGEX_SIGNER_MODE=dev-private-key
FORGEX_ALLOW_DEV_SIGNER=1
PRIVATE_KEY=0xYOUR_TESTNET_PRIVATE_KEY
FORGEX_HOST=127.0.0.1
FORGEX_REQUIRE_LOCAL_ONLY=1
```

Use this only with a testnet key you control locally.

### Option B — External Foundry signer

Use this if you want ForgeX to prepare the command and you run the actual Foundry deploy yourself.

Set this in `.env`:

```env
FORGEX_SIGNER_MODE=external
FORGEX_ALLOW_DEV_SIGNER=0
FORGEX_EXTERNAL_ACCOUNT_ALIAS=your_foundry_alias
FORGEX_EXTERNAL_SENDER_ADDRESS=0xYourWalletAddress
FORGEX_HOST=127.0.0.1
FORGEX_REQUIRE_LOCAL_ONLY=1
```

Important:

- `FORGEX_EXTERNAL_ACCOUNT_ALIAS` = your Foundry keystore alias
- `FORGEX_EXTERNAL_SENDER_ADDRESS` = your wallet `0x...` address

If you do not have a Foundry alias yet:

### PowerShell

```powershell
cast wallet import myxrptestnet --interactive
cast wallet list
```

### WSL

```bash
cast wallet import myxrptestnet --interactive
cast wallet list
```

## 5. Start ForgeX

### PowerShell

```powershell
npm run start
```

### WSL

```bash
npm run start
```

Then open:

```text
http://127.0.0.1:3000
```

## 6. Quick health check

You should see:

- ForgeX opens in the browser
- the backend is local only
- deploy commands use your real alias/address, not placeholders

If the UI still shows:

```text
<foundry-account-alias>
<operator-address>
```

then your `.env` is still missing:

- `FORGEX_EXTERNAL_ACCOUNT_ALIAS`
- `FORGEX_EXTERNAL_SENDER_ADDRESS`

and you need to restart ForgeX after fixing `.env`.

## 7. How to deploy

## If using `dev-private-key`

In the UI:

```text
deploy contract
```

ForgeX should handle the deploy directly.

## If using `external`

In the UI:

```text
deploy contract
```

ForgeX will show you a Foundry command.

Run that command in the same terminal environment where your Foundry alias exists.

Example:

```powershell
cd "$env:USERPROFILE\Documents\New project\forgex"
forge script script/Deploy.s.sol:DeployScript --rpc-url https://rpc.testnet.xrplevm.org --broadcast --account your_alias --sender 0xYourWalletAddress --legacy
```

After it succeeds, go back to ForgeX and do one of these:

- click `Paste tx hash` and paste the vault deployment tx hash
- click `Import Foundry broadcast` and use the broadcast file path

### Windows broadcast path

```text
C:\Users\<YOUR_WINDOWS_USER>\Documents\New project\forgex\broadcast\Deploy.s.sol\1449000\run-latest.json
```

### WSL broadcast path

```text
/mnt/c/Users/<YOUR_WINDOWS_USER>/Documents/New project/forgex/broadcast/Deploy.s.sol/1449000/run-latest.json
```

If the deploy script created multiple transactions, `Import Foundry broadcast` is usually the safer choice.

## 8. Foundry checks

If you want to verify contracts too:

### PowerShell

```powershell
forge build
forge test -vvv
forge test --match-path test/ForgeXMessageVault.invariant.t.sol -vvv
forge fmt --check
```

### WSL

```bash
forge build
forge test -vvv
forge test --match-path test/ForgeXMessageVault.invariant.t.sol -vvv
forge fmt --check
```

## 9. Common mistakes

### "The system cannot find the path specified. (os error 3)"

You are not inside the ForgeX repo folder.

Fix:

### PowerShell

```powershell
cd "$env:USERPROFILE\Documents\New project\forgex"
```

### WSL

```bash
cd "/mnt/c/Users/<YOUR_WINDOWS_USER>/Documents/New project/forgex"
```

### "Keystore file does not exist"

Your Foundry alias exists in a different shell environment.

Example:

- alias created in Windows PowerShell
- deploy command run in WSL

Fix:

- either run the deploy in the same environment where the alias exists
- or import the alias again in the shell you are using

### "ForgeX still shows placeholders"

Your `.env` is missing external signer values, or you changed `.env` without restarting the server.

### "Import Foundry broadcast failed"

You pasted a tx hash into the broadcast-path box.

Use:

- `Paste tx hash` for a tx hash
- `Import Foundry broadcast` for a file path

## 10. The shortest working path

If you want the shortest path with the fewest moving parts:

1. `cd` into ForgeX
2. `npm install`
3. copy `.env.example` to `.env`
4. use `dev-private-key` mode if you want the app to deploy directly
5. use `external` mode only if you want the stricter Foundry handoff flow
6. `npm run start`
7. open `http://127.0.0.1:3000`

## 11. Related docs

- [README.md](../README.md)
- [OPERATIONS.md](./OPERATIONS.md)
- [FOUNDRY-VERIFICATION.md](./FOUNDRY-VERIFICATION.md)
