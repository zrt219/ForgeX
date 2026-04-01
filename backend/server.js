import dotenv from "dotenv";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthManager } from "./auth.js";
import { parseCommand } from "./command-router.js";
import { loadConfig } from "./config.js";
import { initializeNdjson, createPacketWriter } from "./ndjson.js";
import { readJson, writeJson } from "./json-store.js";
import { createRuntime } from "./runtime.js";
import { RunEngine } from "./run-engine.js";
import { RunStore } from "./run-store.js";
import { createSignerAdapter } from "./signer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(root, ".env") });

const config = loadConfig(process.env);
const app = express();
const frontendDir = path.join(root, "frontend");
const japanDir = path.join(root, "japan");
const shadersDir = path.join(root, "shaders");
const threeBuildDir = path.join(root, "node_modules", "three", "build");
const uiStatePath = path.join(root, config.uiStatePath);
const ALLOWED_BACKGROUNDS = new Set(["hokusai-1", "kunisada", "utamaro", "hokusai-2"]);
const STATIC_NO_CACHE = {
  etag: false,
  lastModified: false,
  setHeaders(response) {
    response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
  }
};

function clampNumber(value, min, max, fallback = null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, min), max);
}

function sanitizeUiStatePayload(payload) {
  const next = {};

  if (payload && typeof payload === "object") {
    if (payload.terminal && typeof payload.terminal === "object") {
      next.terminal = {
        x: clampNumber(payload.terminal.x, 0, 10000, null),
        y: clampNumber(payload.terminal.y, 0, 10000, null),
        width: clampNumber(payload.terminal.width, 320, 5000, null),
        height: clampNumber(payload.terminal.height, 240, 5000, null),
        devMode: payload.terminal.devMode === true
      };
    }

    if (typeof payload.backgroundId === "string" && ALLOWED_BACKGROUNDS.has(payload.backgroundId)) {
      next.backgroundId = payload.backgroundId;
    }

    if (typeof payload.themeId === "string" && ALLOWED_BACKGROUNDS.has(payload.themeId)) {
      next.themeId = payload.themeId;
    }

    if (payload.overlay && typeof payload.overlay === "object") {
      next.overlay = {
        permanenceMessage:
          typeof payload.overlay.permanenceMessage === "string"
            ? payload.overlay.permanenceMessage.slice(0, 200)
            : null,
        visible: payload.overlay.visible === true
      };
    }
  }

  return next;
}

function ensureJsonFile(filePath, fallback) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${JSON.stringify(fallback, null, 2)}${os.EOL}`, "utf8");
  }
}

ensureJsonFile(uiStatePath, {
  terminal: { x: null, y: null, width: null, height: null, devMode: false },
  overlay: { permanenceMessage: null, visible: false },
  backgroundId: "hokusai-1",
  themeId: "hokusai-1",
  updatedAt: null
});

const auth = createAuthManager(config);
const store = new RunStore({ root, relativePath: config.runDbPath });
const runtime = createRuntime({
  root,
  env: process.env,
  shell: process.platform === "win32" ? process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe" : process.env.SHELL || "/bin/sh",
  cliEntry: path.join(root, "cli", "index.js"),
  castTool: {
    command: config.foundry.castBin,
    args: config.foundry.castArgs
  }
});
const signer = createSignerAdapter({ config, env: process.env, root });
const engine = new RunEngine({ root, env: process.env, config, store, signer });

function validateStartupConfig() {
  const warnings = [];

  if (config.signerMode !== "external") {
    warnings.push(`ForgeX signer mode is ${config.signerMode}. External signer is the default trusted mode.`);
  }

  if (config.security.testMode) {
    warnings.push("ForgeX test mode is enabled. This mode is not valid for sponsor or production use.");
  }

  if (process.env.FORGEX_DEV_ASSUME_RECEIPT === "1" && !config.security.testMode) {
    warnings.push("FORGEX_DEV_ASSUME_RECEIPT is set but ignored because FORGEX_TEST_MODE is not enabled.");
  }

  return warnings;
}

runtime.start();

app.use(express.json({ limit: "1mb" }));
app.use(auth.requireLocalRequest);
app.use(express.static(frontendDir, STATIC_NO_CACHE));
app.use("/japan", express.static(japanDir, STATIC_NO_CACHE));
app.use("/shaders", express.static(shadersDir, STATIC_NO_CACHE));
app.use("/vendor/three", express.static(threeBuildDir, STATIC_NO_CACHE));

function createActionableError(error, command) {
  const message = error instanceof Error ? error.message : String(error);
  const fallback = `If the UI path keeps failing, run \`npx forgex ${command}\` in your local terminal for the same action.`;

  return {
    message,
    fixSteps: [
      "Verify Foundry is installed: `forge --version` and `cast --version`.",
      `Verify XRPL RPC is reachable: ${config.xrpl.rpcUrl}.`,
      fallback
    ]
  };
}

function resolveIdempotencyKey(request) {
  return (
    request.get("x-forgex-idempotency") ||
    request.body?.idempotencyKey ||
    `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
  );
}

function writeRunToStream(writer, describedRun) {
  for (const event of describedRun.events || []) {
    writer.log(event.status, event.message, event.data || {});
  }

  const result = describedRun.resultSnapshot || {
    success: false,
    finalOutput: "ForgeX run completed without a result snapshot.",
    nextActions: ["Show history"]
  };

  if (result.metadata?.commandPreview) {
    writer.log("execution", `Command: ${result.metadata.commandPreview}`);
  }

  writer.data("result", {
    result: {
      ...result,
      forgeRunId: describedRun.forgeRunId
    }
  });
  writer.complete(Boolean(result.success), {
    statusCode: result.success ? 200 : 400,
    result: {
      ...result,
      forgeRunId: describedRun.forgeRunId
    }
  });
}

async function executeParsedCommand(parsed, actorId, idempotencyKey) {
  switch (parsed.kind) {
    case "deploy-message-vault":
      return engine.deployMessageVault({
        actorId,
        idempotencyKey,
        initialMessage: process.env.FORGEX_INITIAL_MESSAGE || "🗻 ForgeX online on XRPL EVM"
      });
    case "set-message":
      return engine.setMessage({
        actorId,
        idempotencyKey,
        message: parsed.value
      });
    case "get-message":
      return engine.getMessage({
        actorId,
        idempotencyKey
      });
    case "finalize-deploy":
      return engine.finalizePreparedDeploy({
        actorId,
        idempotencyKey,
        forgeRunId: parsed.forgeRunId,
        txHash: parsed.txHash
      });
    case "import-deploy-broadcast":
      return engine.finalizePreparedDeployFromBroadcast({
        actorId,
        idempotencyKey,
        forgeRunId: parsed.forgeRunId,
        broadcastPath: parsed.broadcastPath
      });
    case "history":
      return {
        forgeRunId: `history_${Date.now()}`,
        events: [
          {
            status: "finalized",
            message: "History loaded.",
            data: {}
          }
        ],
        resultSnapshot: {
          success: true,
          status: "idle",
          phase: "idle",
          mode: "history",
          message: "History loaded.",
          finalOutput: [
            "🗻 ForgeX History",
            "",
            ...store.listDeployments().map((entry) => `${entry.createdAt} ${entry.contractAddress}`)
          ].join("\n") || "🗻 ForgeX History\n\nNo deployments recorded yet.",
          nextActions: ["Deploy again"]
        }
      };
    case "menu":
      return {
        forgeRunId: `menu_${Date.now()}`,
        events: [
          {
            status: "finalized",
            message: "Menu ready.",
            data: {}
          }
        ],
        resultSnapshot: {
          success: true,
          status: "idle",
          phase: "idle",
          mode: "menu",
          message: "Menu ready.",
          finalOutput: [
            "🗻 ForgeX Main Menu",
            "",
            "deploy contract",
            "get value",
            "set value <message>",
            "finalize deploy <forgeRunId> <txHash>",
            "import broadcast <forgeRunId>",
            "show history"
          ].join("\n"),
          nextActions: ["Deploy again", "Show history"]
        }
      };
    default:
      throw new Error("Unsupported command.");
  }
}

function streamCommand(request, response, commandText) {
  initializeNdjson(response);
  const writer = createPacketWriter(response);
  const actorId = request.forgexActor?.actorId || config.operatorId;
  const parsed = parseCommand(commandText);

  if (parsed.kind === "invalid") {
    const actionable = createActionableError(new Error(parsed.error), "menu");
    writer.error("validation", actionable.message, { fixSteps: actionable.fixSteps });
    writer.complete(false, {
      statusCode: 400,
      result: {
        success: false,
        finalOutput: `ForgeX rejected the command.\n\n${actionable.message}\n\nFix:\n- ${actionable.fixSteps.join("\n- ")}`,
        nextActions: ["Show history"]
      }
    });
    return;
  }

  const idempotencyKey = resolveIdempotencyKey(request);
  writer.log("accepted", `Accepted command: ${commandText}`);
  writer.log("preflight", "Checking Foundry and XRPL connectivity...");

  executeParsedCommand(parsed, actorId, idempotencyKey)
    .then((describedRun) => writeRunToStream(writer, describedRun))
    .catch((error) => {
      const fallbackCommand =
        parsed.kind === "deploy-message-vault"
          ? "deploy"
          : parsed.kind === "set-message"
            ? `set-message --value \"${parsed.value || ""}\"`
            : "get-message";
      const actionable = createActionableError(error, fallbackCommand);
      writer.error("failed", actionable.message, { fixSteps: actionable.fixSteps });
      writer.complete(false, {
        statusCode: 500,
        result: {
          success: false,
          finalOutput: `ForgeX could not complete the run.\n\n${actionable.message}\n\nFix:\n- ${actionable.fixSteps.join("\n- ")}`,
          nextActions: ["Show history"],
          error: actionable.message
        }
      });
    });
}

app.get("/api/session", (request, response) => {
  if (!auth.isLocalRequest(request) && config.requireLocalOnly) {
    response.status(403).json({
      ok: false,
      error: "ForgeX only issues sessions locally."
    });
    return;
  }

  response.json({
    ok: true,
    ...auth.issueSession(),
    signerMode: config.signerMode,
    localOnly: config.requireLocalOnly
  });
});

app.post("/ai", auth.requireSession, (request, response) => {
  const text = String(request.body?.text || request.body?.command || "").trim();
  streamCommand(request, response, text);
});

app.post("/api/command", auth.requireSession, async (request, response) => {
  const text = String(request.body?.text || request.body?.command || "").trim();
  const parsed = parseCommand(text);

  if (parsed.kind === "invalid") {
    response.status(400).json({
      ok: false,
      result: {
        success: false,
        finalOutput: `ForgeX rejected the command.\n\n${parsed.error}\n\nFix:\n- Try: deploy contract\n- Try: get value\n- Try: set value <message>\n- Try: finalize deploy <forgeRunId> <txHash>\n- Try: import broadcast <forgeRunId>\n- Try: show history`,
        nextActions: ["Show history"]
      }
    });
    return;
  }

  try {
    const describedRun = await executeParsedCommand(
      parsed,
      request.forgexActor?.actorId || config.operatorId,
      resolveIdempotencyKey(request)
    );
    response.json({
      ok: true,
      run: describedRun,
      result: {
        ...(describedRun.resultSnapshot || {}),
        forgeRunId: describedRun.forgeRunId
      }
    });
  } catch (error) {
    const actionable = createActionableError(error, "help");
    response.status(500).json({
      ok: false,
      result: {
        success: false,
        finalOutput: `ForgeX could not complete the run.\n\n${actionable.message}\n\nFix:\n- ${actionable.fixSteps.join("\n- ")}`,
        nextActions: ["Show history"],
        error: actionable.message
      }
    });
  }
});

app.post("/runs/deploy-message-vault", auth.requireSession, async (request, response) => {
  try {
    const run = await engine.deployMessageVault({
      actorId: request.forgexActor.actorId,
      idempotencyKey: resolveIdempotencyKey(request),
      initialMessage: request.body?.initialMessage || process.env.FORGEX_INITIAL_MESSAGE || "🗻 ForgeX online on XRPL EVM"
    });
    response.json({ ok: true, run });
  } catch (error) {
    response.status(500).json({ ok: false, error: createActionableError(error, "deploy") });
  }
});

app.post("/runs/set-message", auth.requireSession, async (request, response) => {
  try {
    const run = await engine.setMessage({
      actorId: request.forgexActor.actorId,
      idempotencyKey: resolveIdempotencyKey(request),
      message: String(request.body?.message || "").trim(),
      deploymentId: request.body?.deploymentId || null
    });
    response.json({ ok: true, run });
  } catch (error) {
    response.status(500).json({ ok: false, error: createActionableError(error, "set-message") });
  }
});

app.post("/runs/get-message", auth.requireSession, async (request, response) => {
  try {
    const run = await engine.getMessage({
      actorId: request.forgexActor.actorId,
      idempotencyKey: resolveIdempotencyKey(request),
      deploymentId: request.body?.deploymentId || null
    });
    response.json({ ok: true, run });
  } catch (error) {
    response.status(500).json({ ok: false, error: createActionableError(error, "get-message") });
  }
});

app.get("/runs/:forgeRunId", auth.requireSession, (request, response) => {
  try {
    response.json({ ok: true, run: engine.describeRun(request.params.forgeRunId) });
  } catch (error) {
    response.status(404).json({ ok: false, error: createActionableError(error, "show history") });
  }
});

app.get("/deployments", auth.requireSession, (_request, response) => {
  response.json({ ok: true, deployments: engine.listDeployments() });
});

app.get("/deployments/:deploymentId", auth.requireSession, (request, response) => {
  const deployment = engine.getDeployment(request.params.deploymentId);
  if (!deployment) {
    response.status(404).json({ ok: false, error: "Deployment not found." });
    return;
  }
  response.json({ ok: true, deployment });
});

let sseConnections = 0;
app.get("/events", auth.requireSession, (request, response) => {
  if (sseConnections >= config.security.maxSseConnections) {
    response.status(429).json({
      ok: false,
      error: "Too many live ForgeX event streams. Close another local tab and retry."
    });
    return;
  }

  sseConnections += 1;
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders?.();

  const emit = (type, payload) => {
    response.write(`event: ${type}\n`);
    response.write(`data: ${JSON.stringify({ type, at: new Date().toISOString(), payload })}\n\n`);
  };

  emit("runtime.snapshot", runtime.getRuntimeStatus());

  const timer = setInterval(() => {
    emit("runtime.snapshot", runtime.getRuntimeStatus());
  }, 15000);

  request.on("close", () => {
    clearInterval(timer);
    sseConnections = Math.max(0, sseConnections - 1);
  });
});

app.get("/api/runtime-status", auth.requireSession, (_request, response) => {
  response.json(runtime.getRuntimeStatus());
});

app.get("/state/ui", auth.requireSession, (_request, response) => {
  response.json(readJson(uiStatePath, {}));
});

app.post("/state/ui", auth.requireSession, (request, response) => {
  const current = readJson(uiStatePath, {});
  const sanitized = sanitizeUiStatePayload(request.body);
  const next = {
    ...current,
    ...sanitized,
    updatedAt: new Date().toISOString()
  };
  writeJson(uiStatePath, next);
  response.json(next);
});

app.get("/api/health", auth.requireSession, (_request, response) => {
  response.json({
    ok: true,
    mode: config.signerMode,
    localOnly: config.requireLocalOnly,
    runtime: runtime.getRuntimeStatus()
  });
});

app.get("/", (_request, response) => {
  response.sendFile(path.join(frontendDir, "index.html"));
});

app.listen(config.port, config.host, () => {
  process.stdout.write(
    `ForgeX backend listening on http://${config.host}:${config.port}${os.EOL}`
  );
  process.stdout.write(
    `ForgeX active architecture: local-only, authenticated operator session, typed runs, ${config.signerMode} signer mode, chain-confirmed finalization.${os.EOL}`
  );
  for (const warning of validateStartupConfig()) {
    process.stdout.write(`ForgeX warning: ${warning}${os.EOL}`);
  }
});
