import crypto from "node:crypto";
import EventEmitter from "node:events";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readJson, writeJson } from "./json-store.js";

const EXPLORER_BASE_URL = "https://explorer.testnet.xrplevm.org";
const ARTIFACT_STATE_PATH = ["state", "artifactState.json"];
const PRICE_STATE_PATH = ["state", "marketState.json"];
const DEFAULT_SIMULATION_ADDRESS = "0xd3f0f3e000000000000000000000000000000abc";
const DEFAULT_SIMULATION_VALUE = "ForgeX online on XRPL EVM";
const READY_STATES = {
  BOOTING: "BOOTING",
  WARMING: "WARMING",
  READY: "READY",
  DEGRADED: "DEGRADED"
};

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

function resolveStatePath(root, segments) {
  return path.join(root, ...segments);
}

function hashBuffer(buffer) {
  return createHash("sha1").update(buffer).digest("hex");
}

function listFilesRecursive(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return [];
  }

  const stats = fs.statSync(targetPath);
  if (!stats.isDirectory()) {
    return [targetPath];
  }

  const results = [];
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    results.push(...listFilesRecursive(path.join(targetPath, entry.name)));
  }
  return results;
}

function getWatchTargets(root) {
  return [
    path.join(root, "contracts"),
    path.join(root, "script"),
    path.join(root, "lib"),
    path.join(root, "foundry.toml")
  ].filter((target) => fs.existsSync(target));
}

function getArtifactTargets(root) {
  return [
    path.join(root, "out"),
    path.join(root, "cache", "solidity-files-cache.json")
  ];
}

function fingerprintPaths(paths) {
  const hash = crypto.createHash("sha1");
  let fileCount = 0;

  for (const target of paths) {
    for (const filePath of listFilesRecursive(target).sort()) {
      const relative = filePath;
      const stats = fs.statSync(filePath);
      hash.update(relative);
      hash.update(String(stats.size));
      hash.update(String(stats.mtimeMs));
      fileCount += 1;

      if (stats.size <= 1024 * 256) {
        hash.update(fs.readFileSync(filePath));
      }
    }
  }

  return {
    fingerprint: hash.digest("hex"),
    fileCount
  };
}

class EventBus {
  constructor() {
    this.emitter = new EventEmitter();
    this.lastEvents = [];
  }

  publish(type, payload = {}) {
    const event = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      type,
      at: new Date().toISOString(),
      payload
    };

    this.lastEvents.push(event);
    if (this.lastEvents.length > 100) {
      this.lastEvents.shift();
    }

    this.emitter.emit("event", event);
    return event;
  }

  subscribe(listener) {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  snapshot() {
    return [...this.lastEvents];
  }
}

class PerformanceStore {
  constructor() {
    this.commandRuns = [];
    this.startup = {
      shellReadyMs: null,
      prewarmStartedMs: null,
      readyMs: null,
      tasks: {}
    };
    this.maxRuns = 200;
  }

  markStartup(name, durationMs) {
    this.startup.tasks[name] = {
      durationMs,
      at: new Date().toISOString()
    };
  }

  markShellReady(durationMs) {
    this.startup.shellReadyMs = durationMs;
  }

  markPrewarmStarted(durationMs) {
    this.startup.prewarmStartedMs = durationMs;
  }

  markRuntimeReady(durationMs) {
    this.startup.readyMs = durationMs;
  }

  startRun(command, meta = {}) {
    const run = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      command,
      createdAt: Date.now(),
      meta,
      marks: {}
    };
    this.commandRuns.push(run);
    if (this.commandRuns.length > this.maxRuns) {
      this.commandRuns.shift();
    }
    return run;
  }

  mark(run, key, startedAt = run.createdAt) {
    run.marks[key] = Date.now() - startedAt;
    return run.marks[key];
  }

  complete(run, status, extra = {}) {
    run.completedAt = Date.now();
    run.totalMs = run.completedAt - run.createdAt;
    run.status = status;
    Object.assign(run, extra);
  }

  listRecentRuns() {
    return this.commandRuns.slice(-25).reverse();
  }

  percentile(values, p) {
    if (!values.length) {
      return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[index];
  }

  benchmarkSummary(command) {
    const runs = this.commandRuns.filter((entry) => entry.command === command && typeof entry.totalMs === "number");
    const totals = runs.map((entry) => entry.totalMs);
    return {
      count: runs.length,
      p50: this.percentile(totals, 50),
      p90: this.percentile(totals, 90),
      p99: this.percentile(totals, 99)
    };
  }
}

export class RuntimeReadinessManager {
  constructor({ root, env, shell, cliEntry, castTool, executeWarmBuild }) {
    this.root = root;
    this.env = env;
    this.shell = shell;
    this.cliEntry = cliEntry;
    this.castTool = castTool;
    this.executeWarmBuild = executeWarmBuild;
    this.eventBus = new EventBus();
    this.perf = new PerformanceStore();
    this.bootStartedMs = nowMs();
    this.commandState = {
      runtimeState: "ForgeX Ready"
    };
    this.simulation = {
      address: DEFAULT_SIMULATION_ADDRESS,
      value: DEFAULT_SIMULATION_VALUE,
      ready: true
    };
    this.explorer = {
      baseUrl: EXPLORER_BASE_URL,
      ready: true
    };
    this.readiness = {
      overallStatus: READY_STATES.BOOTING,
      configReady: false,
      commandsReady: false,
      simulationReady: false,
      artifactsReady: false,
      buildFresh: false,
      networkReady: false,
      explorerReady: false,
      marketReady: false,
      logsReady: false,
      uiReady: true,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      errors: {}
    };
    this.market = readJson(resolveStatePath(root, PRICE_STATE_PATH), {
      xrpPriceUsd: null,
      status: "loading",
      updatedAt: null,
      source: "coingecko"
    });
    this.artifacts = readJson(resolveStatePath(root, ARTIFACT_STATE_PATH), {
      sourceFingerprint: null,
      artifactFingerprint: null,
      buildFresh: false,
      stale: true,
      fileCount: 0,
      updatedAt: null
    });
    this.watchers = [];
    this.refreshTimers = [];
    this.refreshArtifactsScheduled = false;
  }

  getRuntimeStatus() {
    return {
      overallStatus: this.readiness.overallStatus,
      systemStatus: this.readiness.overallStatus === READY_STATES.DEGRADED ? "degraded" : "on",
      runtimeState: this.commandState.runtimeState,
      xrpPriceUsd: this.market.xrpPriceUsd,
      marketStatus: this.market.status,
      readiness: {
        configReady: this.readiness.configReady,
        commandsReady: this.readiness.commandsReady,
        simulationReady: this.readiness.simulationReady,
        artifactsReady: this.readiness.artifactsReady,
        buildFresh: this.readiness.buildFresh,
        networkReady: this.readiness.networkReady,
        explorerReady: this.readiness.explorerReady,
        marketReady: this.readiness.marketReady
      },
      updatedAt: this.readiness.updatedAt,
      explorerBaseUrl: this.explorer.baseUrl
    };
  }

  updateReadiness(patch, errorKey = null, error = null) {
    Object.assign(this.readiness, patch);
    if (errorKey) {
      this.readiness.errors[errorKey] = error ? String(error) : null;
    }
    const degraded = Object.values(this.readiness.errors).some(Boolean);
    const allCoreReady =
      this.readiness.configReady &&
      this.readiness.commandsReady &&
      this.readiness.simulationReady &&
      this.readiness.explorerReady &&
      this.readiness.logsReady;
    this.readiness.overallStatus = degraded ? READY_STATES.DEGRADED : allCoreReady ? READY_STATES.READY : READY_STATES.WARMING;
    this.readiness.updatedAt = new Date().toISOString();
    this.eventBus.publish("readiness.updated", this.getRuntimeStatus());
  }

  setRuntimeState(state) {
    this.commandState.runtimeState = state;
    this.eventBus.publish("runtime.state.changed", {
      runtimeState: state,
      overallStatus: this.readiness.overallStatus
    });
  }

  async runTask(name, fn) {
    const startedAt = nowMs();
    try {
      await fn();
      const duration = nowMs() - startedAt;
      this.perf.markStartup(name, duration);
      this.eventBus.publish(`readiness.${name}.ready`, { durationMs: duration });
      return duration;
    } catch (caughtError) {
      const duration = nowMs() - startedAt;
      this.perf.markStartup(name, duration);
      this.updateReadiness({}, name, caughtError instanceof Error ? caughtError.message : String(caughtError));
      this.eventBus.publish("system.prewarm.failed", {
        task: name,
        durationMs: duration,
        error: caughtError instanceof Error ? caughtError.message : String(caughtError)
      });
      return duration;
    }
  }

  async warmConfig() {
    this.updateReadiness({ configReady: true, logsReady: true });
  }

  async warmCommands() {
    this.updateReadiness({ commandsReady: true });
  }

  async warmSimulation() {
    this.simulation.ready = true;
    this.simulation.value = process.env.FORGEX_SIMULATION_VALUE || DEFAULT_SIMULATION_VALUE;
    this.simulation.address = process.env.CONTRACT_ADDRESS || DEFAULT_SIMULATION_ADDRESS;
    this.updateReadiness({ simulationReady: true, explorerReady: true });
  }

  async warmNetwork() {
    const rpcUrl = this.env.XRPL_RPC_URL || "https://rpc.testnet.xrplevm.org";
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_blockNumber",
          params: []
        })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      if (json.error) {
        throw new Error(json.error.message || "Unknown RPC error");
      }
      this.updateReadiness({ networkReady: true }, "network", null);
    } catch (caughtError) {
      this.updateReadiness({ networkReady: false }, "network", caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  }

  async refreshMarketPrice() {
    try {
      const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      const price = Number(json?.ripple?.usd);
      if (!Number.isFinite(price)) {
        throw new Error("No XRP price returned.");
      }
      this.market = {
        xrpPriceUsd: price,
        status: "ready",
        updatedAt: new Date().toISOString(),
        source: "coingecko"
      };
      writeJson(resolveStatePath(this.root, PRICE_STATE_PATH), this.market);
      this.updateReadiness({ marketReady: true }, "market", null);
    } catch (caughtError) {
      this.market = {
        ...this.market,
        status: "degraded",
        updatedAt: new Date().toISOString()
      };
      writeJson(resolveStatePath(this.root, PRICE_STATE_PATH), this.market);
      this.updateReadiness({ marketReady: false }, "market", caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
    this.eventBus.publish("readiness.market.ready", {
      xrpPriceUsd: this.market.xrpPriceUsd,
      marketStatus: this.market.status,
      updatedAt: this.market.updatedAt
    });
  }

  async refreshArtifacts({ emit = true } = {}) {
    const sourceTargets = getWatchTargets(this.root);
    const artifactTargets = getArtifactTargets(this.root).filter((target) => fs.existsSync(target));
    const source = fingerprintPaths(sourceTargets);
    const artifacts = artifactTargets.length ? fingerprintPaths(artifactTargets) : { fingerprint: null, fileCount: 0 };
    const buildFresh = Boolean(artifacts.fingerprint) && source.fingerprint === this.artifacts.sourceFingerprint;

    this.artifacts = {
      sourceFingerprint: source.fingerprint,
      artifactFingerprint: artifacts.fingerprint,
      buildFresh,
      stale: !buildFresh,
      fileCount: source.fileCount,
      updatedAt: new Date().toISOString()
    };
    writeJson(resolveStatePath(this.root, ARTIFACT_STATE_PATH), this.artifacts);
    this.updateReadiness({
      artifactsReady: true,
      buildFresh
    }, "artifacts", null);

    if (emit) {
      this.eventBus.publish("readiness.artifacts.ready", this.artifacts);
    }

    if (!buildFresh && this.executeWarmBuild) {
      this.triggerWarmBuild();
    }
  }

  scheduleArtifactRefresh() {
    if (this.refreshArtifactsScheduled) {
      return;
    }
    this.refreshArtifactsScheduled = true;
    setTimeout(async () => {
      this.refreshArtifactsScheduled = false;
      await this.refreshArtifacts();
    }, 120);
  }

  startArtifactWatcher() {
    const targets = getWatchTargets(this.root);
    for (const target of targets) {
      try {
        const watcher = fs.watch(target, { recursive: true }, () => {
          this.updateReadiness({ artifactsReady: false, buildFresh: false }, "artifacts", null);
          this.scheduleArtifactRefresh();
        });
        this.watchers.push(watcher);
      } catch {
        // best-effort watcher
      }
    }
  }

  triggerWarmBuild() {
    if (this.warmBuildChild) {
      return;
    }

    const forgeCommand = this.env.FORGEX_FORGE_BIN || "forge";
    const forgeArgs = (() => {
      try {
        const parsed = JSON.parse(this.env.FORGEX_FORGE_BIN_ARGS || "[]");
        return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
      } catch {
        return [];
      }
    })();

    this.warmBuildChild = spawn(forgeCommand, [...forgeArgs, "build"], {
      cwd: this.root,
      env: this.env,
      stdio: "ignore",
      shell: false,
      windowsHide: true
    });

    this.warmBuildChild.on("close", async () => {
      this.warmBuildChild = null;
      await this.refreshArtifacts({ emit: true });
    });
  }

  startRefreshLoops() {
    this.refreshTimers.push(setInterval(() => {
      void this.warmNetwork();
    }, 15000));

    this.refreshTimers.push(setInterval(() => {
      void this.refreshMarketPrice();
    }, 20000));
  }

  start() {
    this.eventBus.publish("system.boot.started", {});
    this.perf.markShellReady(nowMs() - this.bootStartedMs);
    this.eventBus.publish("system.shell.ready", { durationMs: this.perf.startup.shellReadyMs });
    this.perf.markPrewarmStarted(nowMs() - this.bootStartedMs);
    this.eventBus.publish("system.prewarm.started", { durationMs: this.perf.startup.prewarmStartedMs });
    this.readiness.overallStatus = READY_STATES.WARMING;

    void this.runTask("config", () => this.warmConfig());
    void this.runTask("commands", () => this.warmCommands());
    void this.runTask("simulation", () => this.warmSimulation());
    void this.runTask("artifacts", () => this.refreshArtifacts({ emit: true }));
    void this.runTask("network", () => this.warmNetwork());
    void this.runTask("market", () => this.refreshMarketPrice());
    this.startArtifactWatcher();
    this.startRefreshLoops();

    setTimeout(() => {
      this.perf.markRuntimeReady(nowMs() - this.bootStartedMs);
      this.eventBus.publish("system.ready", this.getRuntimeStatus());
      this.updateReadiness({});
    }, 0);
  }

  stop() {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    for (const timer of this.refreshTimers) {
      clearInterval(timer);
    }
  }
}

export function createRuntime({ root, env, shell, cliEntry, castTool, executeWarmBuild = true }) {
  return new RuntimeReadinessManager({
    root,
    env,
    shell,
    cliEntry,
    castTool,
    executeWarmBuild
  });
}
