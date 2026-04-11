# ForgeX Quickstart

This is the shortest version.

If you want ForgeX running fast, do this.

## 1. Go into the project

### PowerShell

```powershell
cd "$env:USERPROFILE\Documents\New project\forgex"
```

### WSL

```bash
cd "/mnt/c/Users/<YOUR_WINDOWS_USER>/Documents/New project/forgex"
```

## 2. Install packages

```bash
npm install
```

## 3. Create `.env`

### PowerShell

```powershell
Copy-Item .env.example .env
```

### WSL

```bash
cp .env.example .env
```

## 4. Pick one mode

## Easiest mode: app deploys directly

Put this in `.env`:

```env
FORGEX_SIGNER_MODE=dev-private-key
FORGEX_ALLOW_DEV_SIGNER=1
PRIVATE_KEY=0xYOUR_TESTNET_PRIVATE_KEY
FORGEX_HOST=127.0.0.1
FORGEX_REQUIRE_LOCAL_ONLY=1
```

Use this if you want the fewest steps.

## Stricter mode: you run the Foundry deploy yourself

Put this in `.env`:

```env
FORGEX_SIGNER_MODE=external
FORGEX_ALLOW_DEV_SIGNER=0
FORGEX_EXTERNAL_ACCOUNT_ALIAS=your_foundry_alias
FORGEX_EXTERNAL_SENDER_ADDRESS=0xYourWalletAddress
FORGEX_HOST=127.0.0.1
FORGEX_REQUIRE_LOCAL_ONLY=1
```

Use this if you want external signer handoff.

## 5. Start ForgeX

```bash
npm run start
```

Open:

```text
http://127.0.0.1:3000
```

## 6. Deploy

In ForgeX, run:

```text
deploy contract
```

### If you chose `dev-private-key`

ForgeX should deploy directly.

### If you chose `external`

ForgeX will show a Foundry command.

Run it from the ForgeX folder:

```powershell
forge script script/Deploy.s.sol:DeployScript --rpc-url https://rpc.testnet.xrplevm.org --broadcast --account your_alias --sender 0xYourWalletAddress --legacy
```

Then go back to ForgeX and:

- click `Paste tx hash`, or
- click `Import Foundry broadcast`

## 7. If it breaks

### Wrong folder

If you see:

```text
The system cannot find the path specified. (os error 3)
```

you are not inside the ForgeX folder.

### Placeholder command

If ForgeX still shows:

```text
<foundry-account-alias>
<operator-address>
```

your `.env` is missing:

- `FORGEX_EXTERNAL_ACCOUNT_ALIAS`
- `FORGEX_EXTERNAL_SENDER_ADDRESS`

and you need to restart ForgeX.

### Wrong shell for alias

If Foundry says the keystore does not exist, your alias was created in a different shell environment.

Example:

- alias created in PowerShell
- deploy run from WSL

Run the deploy in the same shell where the alias exists, or import it again there.

## Need the longer version?

- [LAUNCH-INSTRUCTIONS.md](./LAUNCH-INSTRUCTIONS.md)
- [OPERATIONS.md](./OPERATIONS.md)
