import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { info, section } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const projectRoot = path.resolve(__dirname, "..");
const xrplRpcUrl = "https://rpc.testnet.xrplevm.org";

function parseJsonArrayEnv(key) {
  const raw = process.env[key];
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return raw
      .split(/\s+/u)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
}

function resolveTool(commandEnvKey, defaultCommand) {
  return {
    command: process.env[commandEnvKey] || defaultCommand,
    args: parseJsonArrayEnv(`${commandEnvKey}_ARGS`)
  };
}

function quoteForPosix(part) {
  const value = String(part);
  if (value.length === 0) {
    return "''";
  }

  if (/[^a-zA-Z0-9_./:-]/u.test(value)) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }

  return value;
}

function quoteForWindows(part) {
  const value = String(part);
  if (value.length === 0) {
    return '""';
  }

  if (/[\s"()&|<>^]/u.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  return value;
}

function renderCommand(command, args) {
  const quote = process.platform === "win32" ? quoteForWindows : quoteForPosix;
  return [command, ...args].map(quote).join(" ");
}

function redactText(text, redactValues = []) {
  return redactValues.reduce((current, value) => {
    if (!value) {
      return current;
    }

    return current.split(String(value)).join("[redacted]");
  }, String(text));
}

function runExec(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
    windowsHide: true,
    ...options
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

export function ensureTool(commandEnvKey, defaultCommand, friendlyName) {
  const tool = resolveTool(commandEnvKey, defaultCommand);

  try {
    const result = runExec(tool.command, [...tool.args, "--version"]);
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || "tool unavailable");
    }
  } catch {
    throw new Error(
      `${friendlyName} not found.\n\nRun:\ncurl -L https://foundry.paradigm.xyz | bash && foundryup\n\nThen rerun:\nnpx forgex`
    );
  }
}

export function runTool(commandEnvKey, defaultCommand, title, args, options = {}) {
  const tool = resolveTool(commandEnvKey, defaultCommand);
  const fullArgs = [...tool.args, ...args];
  const commandText = renderCommand(tool.command, fullArgs);
  const redactValues = options.redactValues || [];
  const silent = options.silent === true;
  const sanitizedCommand = redactText(commandText, redactValues);

  if (!silent) {
    section(title);
    info(sanitizedCommand);
  }

  const result = runExec(tool.command, fullArgs, options);
  const stdout = redactText(String(result.stdout || ""), redactValues);
  const stderr = redactText(String(result.stderr || ""), redactValues);

  if (result.status === 0) {
    if (!silent && stdout.trim()) {
      process.stdout.write(stdout.endsWith(os.EOL) ? stdout : `${stdout}${os.EOL}`);
    }
    return stdout;
  }

  if (!silent && stdout.trim()) {
    process.stdout.write(stdout.endsWith(os.EOL) ? stdout : `${stdout}${os.EOL}`);
  }

  if (!silent && stderr.trim()) {
    process.stderr.write(stderr.endsWith(os.EOL) ? stderr : `${stderr}${os.EOL}`);
  }

  throw new Error(`${title} failed.`);
}

function latestDeploymentArtifact(notOlderThan = 0) {
  const broadcastRoot = path.join(projectRoot, "broadcast", "Deploy.s.sol");
  if (!fs.existsSync(broadcastRoot)) {
    return null;
  }

  const candidates = [];
  for (const entry of fs.readdirSync(broadcastRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const artifactPath = path.join(broadcastRoot, entry.name, "run-latest.json");
    if (!fs.existsSync(artifactPath)) {
      continue;
    }

    const stats = fs.statSync(artifactPath);
    if (stats.mtimeMs < notOlderThan) {
      continue;
    }
    candidates.push({ artifactPath, modifiedAt: stats.mtimeMs });
  }

  candidates.sort((left, right) => right.modifiedAt - left.modifiedAt);
  return candidates[0]?.artifactPath ?? null;
}

export function extractDeploymentRecord(notOlderThan = 0) {
  const artifactPath = latestDeploymentArtifact(notOlderThan);
  if (!artifactPath) {
    return null;
  }

  try {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const deployment = Array.isArray(artifact.transactions)
      ? artifact.transactions.find((transaction) => transaction.contractAddress)
      : null;

    if (!deployment?.contractAddress) {
      return null;
    }

    return {
      address: deployment.contractAddress,
      txHash: deployment.hash ?? null,
      artifactPath
    };
  } catch {
    return null;
  }
}

export function extractAddressFromOutput(output) {
  const addressLine =
    output.match(/Contract address:\s*(0x[a-fA-F0-9]{40})/u)?.[1] ||
    output.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/u)?.[1] ||
    output.match(/deployedContract:\s*contract\s+\w+\s+(0x[a-fA-F0-9]{40})/u)?.[1] ||
    output.match(/deployedContract:\s*(0x[a-fA-F0-9]{40})/u)?.[1] ||
    null;
  const txHash =
    output.match(/Transaction hash:\s*(0x[a-fA-F0-9]{64})/u)?.[1] ||
    output.match(/Hash:\s*(0x[a-fA-F0-9]{64})/u)?.[1] ||
    null;

  return addressLine ? { address: addressLine, txHash } : null;
}

export function persistEnvValue(key, value) {
  const envPath = path.join(projectRoot, ".env");
  const line = `${key}=${value}`;
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = current ? current.split(/\r?\n/u) : [];
  const index = lines.findIndex((entry) => entry.startsWith(`${key}=`));

  if (index >= 0) {
    lines[index] = line;
  } else {
    lines.push(line);
  }

  const normalized = lines.filter((entry, idx) => idx !== lines.length - 1 || entry.trim().length > 0);
  fs.writeFileSync(envPath, `${normalized.join(os.EOL)}${os.EOL}`, "utf8");
}

export function defaultRpcUrl(value) {
  return value || process.env.XRPL_RPC_URL || xrplRpcUrl;
}

export function deriveTransactionUrl(txHash) {
  if (!txHash) {
    return null;
  }

  const explicitBase = process.env.XRPL_EXPLORER_TX_BASE_URL;
  if (explicitBase) {
    return `${explicitBase.replace(/\/$/, "")}/${txHash}`;
  }

  if (process.env.XRPL_VERIFIER_URL) {
    try {
      const url = new URL(process.env.XRPL_VERIFIER_URL);
      return `${url.origin}/tx/${txHash}`;
    } catch {
      return null;
    }
  }

  return null;
}
