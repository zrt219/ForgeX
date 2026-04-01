import os from "node:os";

export const XRPL_TESTNET_CHAIN_ID = 1449000;
export const XRPL_TESTNET_RPC_URL = "https://rpc.testnet.xrplevm.org";
export const XRPL_TESTNET_EXPLORER = "https://explorer.testnet.xrplevm.org";

function parseAllowedList(value, fallback = []) {
  if (!value) {
    return fallback;
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseJsonArray(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
}

export function loadConfig(env) {
  const signerMode = env.FORGEX_SIGNER_MODE || "external";
  const host = env.FORGEX_HOST || "127.0.0.1";
  const allowedRpcUrls = parseAllowedList(env.FORGEX_ALLOWED_RPC_URLS, [env.XRPL_RPC_URL || XRPL_TESTNET_RPC_URL]);
  const allowDevSigner = env.FORGEX_ALLOW_DEV_SIGNER === "1" || signerMode === "dev-private-key";

  return {
    appName: "ForgeX",
    operatorId: env.FORGEX_OPERATOR_ID || os.userInfo().username || "local-operator",
    host,
    port: Number(env.PORT || 3000),
    signerMode,
    allowDevSigner,
    externalSigner: {
      accountAlias: String(env.FORGEX_EXTERNAL_ACCOUNT_ALIAS || "").trim(),
      senderAddress: String(env.FORGEX_EXTERNAL_SENDER_ADDRESS || "").trim()
    },
    sessionHeader: "x-forgex-session",
    sessionQueryKey: "sessionToken",
    requireLocalOnly: env.FORGEX_REQUIRE_LOCAL_ONLY !== "0",
    runDbPath: env.FORGEX_RUN_DB_PATH || "state/forgex-runs.sqlite",
    uiStatePath: env.FORGEX_UI_STATE_PATH || "state/uiState.json",
    xrpl: {
      chainId: Number(env.XRPL_CHAIN_ID || XRPL_TESTNET_CHAIN_ID),
      rpcUrl: env.XRPL_RPC_URL || XRPL_TESTNET_RPC_URL,
      allowedRpcUrls,
      explorerBaseUrl: env.XRPL_EXPLORER_BASE_URL || XRPL_TESTNET_EXPLORER
    },
    foundry: {
      forgeBin: env.FORGEX_FORGE_BIN || "forge",
      forgeArgs: parseJsonArray(env.FORGEX_FORGE_BIN_ARGS),
      castBin: env.FORGEX_CAST_BIN || "cast",
      castArgs: parseJsonArray(env.FORGEX_CAST_BIN_ARGS)
    },
    security: {
      maxConcurrentWriteRuns: Number(env.FORGEX_MAX_CONCURRENT_WRITE_RUNS || 1),
      maxConcurrentReadRuns: Number(env.FORGEX_MAX_CONCURRENT_READ_RUNS || 4),
      maxSseConnections: Number(env.FORGEX_MAX_SSE_CONNECTIONS || 5),
      childTimeoutMs: Number(env.FORGEX_CHILD_TIMEOUT_MS || 120000),
      rpcTimeoutMs: Number(env.FORGEX_RPC_TIMEOUT_MS || 15000),
      confirmationPollMs: Number(env.FORGEX_CONFIRMATION_POLL_MS || 3000),
      confirmationTimeoutMs: Number(env.FORGEX_CONFIRMATION_TIMEOUT_MS || 120000),
      assumeReceiptInDev: env.FORGEX_DEV_ASSUME_RECEIPT === "1" && env.FORGEX_TEST_MODE === "1",
      testMode: env.FORGEX_TEST_MODE === "1"
    }
  };
}
