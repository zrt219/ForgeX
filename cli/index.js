#!/usr/bin/env node
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../backend/config.js";
import { RunStore } from "../backend/run-store.js";
import { createSignerAdapter } from "../backend/signer.js";
import { RunEngine } from "../backend/run-engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(root, ".env") });

function parseArgs(argv) {
  const flags = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }

  return {
    command: positionals[0] || "help",
    args: positionals.slice(1),
    flags
  };
}

function print(text = "") {
  process.stdout.write(`${text}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function printUsage() {
  print("ForgeX CLI");
  print("");
  print("Commands:");
  print("  forgex deploy [--signer external|dev-private-key]");
  print("  forgex get-message [--deployment <deploymentId>]");
  print("  forgex set-message --value <text> [--deployment <deploymentId>]");
  print("  forgex runs show <forgeRunId>");
  print("  forgex deployments list");
  print("  forgex history");
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.command === "help" || parsed.flags.help) {
    printUsage();
    return;
  }

  const env = { ...process.env };
  if (parsed.flags.signer) {
    env.FORGEX_SIGNER_MODE = parsed.flags.signer;
  }

  const config = loadConfig(env);
  const store = new RunStore({ root, relativePath: config.runDbPath });
  const signer = createSignerAdapter({ config, env, root });
  const engine = new RunEngine({ root, env, config, store, signer });
  const actorId = config.operatorId;
  const idempotencyKey = `cli_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  try {
    switch (parsed.command) {
      case "deploy": {
        const run = await engine.deployMessageVault({
          actorId,
          idempotencyKey,
          initialMessage: env.FORGEX_INITIAL_MESSAGE || "🗻 ForgeX online on XRPL EVM"
        });
        print(run.resultSnapshot?.finalOutput || "No output.");
        if (run.resultSnapshot?.metadata?.commandPreview) {
          print("");
          print(run.resultSnapshot.metadata.commandPreview);
        }
        break;
      }
      case "get-message": {
        const run = await engine.getMessage({
          actorId,
          idempotencyKey,
          deploymentId: parsed.flags.deployment || null
        });
        print(run.resultSnapshot?.finalOutput || "No output.");
        break;
      }
      case "set-message": {
        const value = String(parsed.flags.value || "").trim();
        if (!value) {
          throw new Error("ForgeX requires a message. Use `forgex set-message --value \"hello\"`.");
        }

        const run = await engine.setMessage({
          actorId,
          idempotencyKey,
          deploymentId: parsed.flags.deployment || null,
          message: value
        });
        print(run.resultSnapshot?.finalOutput || "No output.");
        if (run.resultSnapshot?.metadata?.commandPreview) {
          print("");
          print(run.resultSnapshot.metadata.commandPreview);
        }
        break;
      }
      case "runs": {
        if (parsed.args[0] !== "show" || !parsed.args[1]) {
          throw new Error("Use `forgex runs show <forgeRunId>`.");
        }
        const run = engine.describeRun(parsed.args[1]);
        print(JSON.stringify(run, null, 2));
        break;
      }
      case "deployments": {
        if (parsed.args[0] !== "list") {
          throw new Error("Use `forgex deployments list`.");
        }
        print(JSON.stringify(engine.listDeployments(), null, 2));
        break;
      }
      case "history": {
        print(JSON.stringify(engine.listDeployments(), null, 2));
        break;
      }
      default:
        throw new Error("Unknown command. Run `forgex help`.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`${message}\n\nFix:\n- Verify Foundry is installed.\n- Verify XRPL RPC is reachable.\n- Retry from the local terminal.`);
  } finally {
    store.close();
  }
}

main().then(() => {
  process.exit(process.exitCode ?? 0);
});
