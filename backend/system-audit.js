import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const fakeCastStatePath = path.join(os.tmpdir(), "forgex-fake-cast-state.json");

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const onStdout = (chunk) => {
      if (String(chunk).includes("ForgeX backend listening")) {
        cleanup();
        resolve();
      }
    };
    const onStderr = (chunk) => {
      stderr += String(chunk);
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`Server exited before ready. Code: ${code}\n${stderr}`));
    };
    const cleanup = () => {
      child.stdout?.off("data", onStdout);
      child.stderr?.off("data", onStderr);
      child.off("exit", onExit);
    };
    child.stdout?.on("data", onStdout);
    child.stderr?.on("data", onStderr);
    child.on("exit", onExit);
  });
}

function buildEnv(port, signerMode) {
  const runDbPath = path.join(os.tmpdir(), `forgex-audit-${signerMode}-${port}.sqlite`);
  fs.rmSync(runDbPath, { force: true });

  return {
    ...process.env,
    PORT: String(port),
    FORGEX_HOST: "127.0.0.1",
    XRPL_RPC_URL: "https://rpc.testnet.xrplevm.org",
    XRPL_CHAIN_ID: "1449000",
    FORGEX_SIGNER_MODE: signerMode,
    FORGEX_ALLOW_DEV_SIGNER: signerMode === "dev-private-key" ? "1" : "0",
    FORGEX_DEV_ASSUME_RECEIPT: signerMode === "dev-private-key" ? "1" : "0",
    FORGEX_TEST_MODE: "1",
    FORGEX_RUN_DB_PATH: runDbPath,
    PRIVATE_KEY: `0x${"11".repeat(32)}`,
    FORGEX_FORGE_BIN: process.execPath,
    FORGEX_FORGE_BIN_ARGS: JSON.stringify([path.join(root, "backend", "test-bin", "fake-forge.js")]),
    FORGEX_CAST_BIN: process.execPath,
    FORGEX_CAST_BIN_ARGS: JSON.stringify([path.join(root, "backend", "test-bin", "fake-cast.js")]),
    FORGEX_ENABLE_CHAIN_MONITOR: "0"
  };
}

async function issueSession(baseUrl) {
  const response = await fetch(`${baseUrl}/api/session`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(payload.sessionToken);
  return payload.sessionToken;
}

async function withServer(signerMode, callback) {
  const port = 4100 + Math.floor(Math.random() * 500);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(root, "backend", "server.js")], {
    cwd: root,
    env: buildEnv(port, signerMode),
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(child);
    return await callback(baseUrl);
  } finally {
    child.kill();
  }
}

async function main() {
  fs.rmSync(fakeCastStatePath, { force: true });

  await withServer("external", async (baseUrl) => {
    const token = await issueSession(baseUrl);

    const runtime = await fetch(`${baseUrl}/api/runtime-status`, {
      headers: { "x-forgex-session": token, Accept: "application/json" }
    });
    assert.equal(runtime.status, 200);

    const invalid = await fetch(`${baseUrl}/api/command`, {
      method: "POST",
      headers: { "x-forgex-session": token, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "rm -rf everything" })
    });
    assert.equal(invalid.status, 400);

    const preparedDeploy = await fetch(`${baseUrl}/api/command`, {
      method: "POST",
      headers: { "x-forgex-session": token, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "deploy contract" })
    });
    const preparedDeployJson = await preparedDeploy.json();
    assert.equal(preparedDeploy.status, 200);
    assert.equal(preparedDeployJson.result.status, "prepared");
    assert.equal(preparedDeployJson.result.phase, "prepared");
    assert.equal(preparedDeployJson.result.success, true);
    assert.equal(preparedDeployJson.result.transactionHash, null);
    assert.equal(preparedDeployJson.result.contractAddress, "");
    assert.equal(preparedDeployJson.result.explorer.txUrl, null);
    assert.equal(preparedDeployJson.result.explorer.addressUrl, null);
    assert.equal(preparedDeployJson.result.actions.canOpenContract, false);
    assert.equal(preparedDeployJson.result.actions.canViewTransaction, false);
    assert.match(preparedDeployJson.result.finalOutput, /Deployment prepared/u);

    const sse = await fetch(`${baseUrl}/events?sessionToken=${token}`, {
      headers: { Accept: "text/event-stream" }
    });
    assert.equal(sse.status, 200);
    sse.body?.cancel();

    const uiStateWrite = await fetch(`${baseUrl}/state/ui`, {
      method: "POST",
      headers: { "x-forgex-session": token, "Content-Type": "application/json" },
      body: JSON.stringify({
        terminal: { x: 12, y: 22, width: 700, height: 500, devMode: true, inject: "nope" },
        backgroundId: "utamaro",
        themeId: "utamaro",
        arbitrary: "ignored",
        overlay: { permanenceMessage: "ok", visible: true, extra: "ignored" }
      })
    });
    const uiStateJson = await uiStateWrite.json();
    assert.equal(uiStateWrite.status, 200);
    assert.equal(uiStateJson.arbitrary, undefined);
    assert.equal(uiStateJson.terminal.inject, undefined);
    assert.equal(uiStateJson.backgroundId, "utamaro");
  });

  await withServer("dev-private-key", async (baseUrl) => {
    const token = await issueSession(baseUrl);

    const deploy = await fetch(`${baseUrl}/api/command`, {
      method: "POST",
      headers: { "x-forgex-session": token, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "deploy contract" })
    });
    const deployJson = await deploy.json();
    assert.equal(deploy.status, 200);
    assert.equal(deployJson.result.success, true);
    assert.match(deployJson.result.finalOutput, /is now permanent/u);

    const setValue = await fetch(`${baseUrl}/api/command`, {
      method: "POST",
      headers: { "x-forgex-session": token, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "set value mount fuji" })
    });
    const setValueJson = await setValue.json();
    assert.equal(setValue.status, 200);
    assert.equal(setValueJson.result.success, true);
    assert.match(setValueJson.result.finalOutput, /mount fuji/u);

    const getValue = await fetch(`${baseUrl}/api/command`, {
      method: "POST",
      headers: { "x-forgex-session": token, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "get value" })
    });
    const getValueJson = await getValue.json();
    assert.equal(getValue.status, 200);
    assert.equal(getValueJson.result.success, true);
    assert.match(getValueJson.result.finalOutput, /mount fuji/u);
  });

  process.stdout.write("ForgeX audit passed: local-only auth, typed runs, actionable failures, and XRPL-safe execution paths are wired.\n");
}

main().catch((error) => {
  process.stderr.write(`ForgeX audit failed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
