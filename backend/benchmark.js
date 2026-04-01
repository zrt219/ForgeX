import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

function percentile(values, p) {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function summarize(runs) {
  const firstOutput = runs.map((entry) => entry.firstOutputMs);
  const total = runs.map((entry) => entry.durationMs);
  return {
    count: runs.length,
    firstOutput: {
      p50: percentile(firstOutput, 50),
      p90: percentile(firstOutput, 90),
      p99: percentile(firstOutput, 99)
    },
    total: {
      p50: percentile(total, 50),
      p90: percentile(total, 90),
      p99: percentile(total, 99)
    }
  };
}

function runCli(args, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let firstOutputMs = null;

    const child = spawn(process.execPath, [path.join(root, "cli", "index.js"), ...args], {
      cwd: root,
      env: {
        ...process.env,
        FORGEX_FORGE_BIN: process.execPath,
        FORGEX_FORGE_BIN_ARGS: JSON.stringify([path.join(root, "backend", "test-bin", "fake-forge.js")]),
        FORGEX_CAST_BIN: process.execPath,
        FORGEX_CAST_BIN_ARGS: JSON.stringify([path.join(root, "backend", "test-bin", "fake-cast.js")]),
        ...envOverrides
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    const onOutput = (chunk, target) => {
      if (firstOutputMs === null) {
        firstOutputMs = Date.now() - start;
      }
      if (target === "stdout") {
        stdout += String(chunk);
      } else {
        stderr += String(chunk);
      }
    };

    child.stdout?.on("data", (chunk) => onOutput(chunk, "stdout"));
    child.stderr?.on("data", (chunk) => onOutput(chunk, "stderr"));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        firstOutputMs: firstOutputMs ?? Date.now() - start
      });
    });
  });
}

async function main() {
  const iterations = Number(process.env.FORGEX_BENCH_ITERATIONS || 7);
  const simulationRuns = [];
  const realRuns = [];

  for (let index = 0; index < iterations; index += 1) {
    simulationRuns.push(
      await runCli([], {
        PRIVATE_KEY: "",
        XRPL_RPC_URL: "https://rpc.testnet.xrplevm.org"
      })
    );
    realRuns.push(
      await runCli(["deploy"], {
        PRIVATE_KEY: `0x${"11".repeat(32)}`,
        XRPL_RPC_URL: "https://rpc.testnet.xrplevm.org"
      })
    );
  }

  const report = {
    simulation: summarize(simulationRuns),
    deploy: summarize(realRuns)
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((caughtError) => {
  process.stderr.write(`${caughtError instanceof Error ? caughtError.stack : String(caughtError)}\n`);
  process.exitCode = 1;
});
