export const EXPLORER_BASE_URL = "https://explorer.testnet.xrplevm.org";

export const DEFAULT_NEXT_ACTIONS = ["Get value", "Set value", "Deploy again", "Show history"];

function normalizeMode(mode) {
  return mode === "simulation" ? "simulation" : "real";
}

export function buildExplorerLinks(txHash, address) {
  const safeAddress = address || "";

  return {
    baseUrl: EXPLORER_BASE_URL,
    txUrl: txHash ? `${EXPLORER_BASE_URL}/tx/${txHash}` : null,
    addressUrl: safeAddress ? `${EXPLORER_BASE_URL}/address/${safeAddress}` : EXPLORER_BASE_URL
  };
}

export function buildDeployFinalOutput(contractAddress, mode = "real") {
  if (!contractAddress) {
    return "";
  }

  return [
    "━━━━━━━━━━━━━━━━━━━━━━━",
    "⚡ ForgeX",
    "",
    `Mode: ${normalizeMode(mode) === "simulation" ? "Simulation" : "Real"}`,
    "",
    "Contract:",
    contractAddress,
    "",
    "is now permanent.",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━",
    "#ForgeX"
  ].join("\n");
}

export function buildShareText(contractAddress) {
  if (!contractAddress) {
    return "";
  }

  return [`🚀 Deployed with ForgeX`, contractAddress, `is now permanent.`, `#ForgeX`].join("\n");
}

export function buildValueReadOutput(value) {
  return ["Current value:", value || ""].join("\n");
}

export function buildValueWriteOutput(value) {
  return ["Value updated.", "", "Current value:", value || ""].join("\n");
}

export function buildTextOutput(title, body) {
  if (!title) {
    return body || "";
  }

  return [title, "", body || ""].join("\n");
}

export function buildNextActions(contractAddress) {
  if (!contractAddress) {
    return ["Deploy again", "Show history"];
  }

  return [...DEFAULT_NEXT_ACTIONS];
}

export function createForgeXResult({
  success,
  mode = "real",
  contractAddress = "",
  transactionHash = null,
  explorer = null,
  finalOutput = "",
  shareText = "",
  nextActions = [],
  error = null
}) {
  const normalizedAddress = contractAddress || "";
  const normalizedMode = normalizeMode(mode);
  const normalizedHash = transactionHash || null;

  return {
    success: Boolean(success),
    mode: normalizedMode,
    contractAddress: normalizedAddress,
    transactionHash: normalizedHash,
    explorer: explorer || buildExplorerLinks(normalizedHash, normalizedAddress),
    finalOutput: finalOutput || "",
    shareText: shareText || (normalizedAddress ? buildShareText(normalizedAddress) : ""),
    nextActions: Array.isArray(nextActions) ? nextActions : [],
    error: error || null
  };
}
