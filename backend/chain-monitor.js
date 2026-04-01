import path from "node:path";
import { readJson, writeJson } from "./json-store.js";

const DEFAULT_INTERVAL = 12000;

async function fetchBlockNumber(rpcUrl) {
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
    throw new Error(`RPC returned HTTP ${response.status}`);
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message || "RPC returned an unknown error");
  }

  return Number.parseInt(json.result, 16);
}

export class ChainMonitor {
  constructor({ root, rpcUrl, intervalMs }) {
    this.root = root;
    this.rpcUrl = rpcUrl;
    this.intervalMs = intervalMs || DEFAULT_INTERVAL;
    this.statePath = path.join(root, "state", "chainState.json");
    this.timer = null;
    this.running = false;
  }

  async pollOnce() {
    const state = readJson(this.statePath, {
      status: "DEGRADED",
      latestBlock: null,
      lastUpdatedAt: null,
      lastHeartbeatAt: null,
      message: "chain monitor starting"
    });

    try {
      const latestBlock = await fetchBlockNumber(this.rpcUrl);
      const nextState = {
        ...state,
        status: "CONNECTED",
        latestBlock,
        lastUpdatedAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        message:
          state.status === "OFFLINE" || state.status === "DEGRADED"
            ? `chain signal restored - block ${latestBlock}`
            : "chain connected"
      };

      writeJson(this.statePath, nextState);
      return nextState;
    } catch (error) {
      const nextState = {
        ...state,
        status: state.latestBlock ? "DEGRADED" : "OFFLINE",
        lastUpdatedAt: new Date().toISOString(),
        message: "chain unavailable"
      };

      writeJson(this.statePath, nextState);
      return nextState;
    }
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    void this.pollOnce();
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.intervalMs);
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
