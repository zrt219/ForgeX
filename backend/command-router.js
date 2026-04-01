function parseSetValue(text) {
  const match = text.match(/^set value\s+(.+)$/iu);
  return match ? match[1].trim() : null;
}

function parseFinalizeDeploy(text) {
  const match = text.match(/^finalize deploy\s+(forgeRun_[^\s]+)\s+(0x[a-fA-F0-9]{64})$/u);
  if (!match) {
    return null;
  }

  return {
    forgeRunId: match[1],
    txHash: match[2]
  };
}

function parseImportBroadcast(text) {
  const match = text.match(/^import broadcast\s+(forgeRun_[^\s]+)(?:\s+(.+))?$/u);
  if (!match) {
    return null;
  }

  return {
    forgeRunId: match[1],
    broadcastPath: match[2]?.trim() || null
  };
}

export function parseCommand(input) {
  const command = String(input || "").trim();
  const normalized = command.toLowerCase();

  if (!command) {
    return { kind: "invalid", error: "Command is required." };
  }

  if (normalized === "deploy contract" || normalized === "deploy") {
    return { kind: "deploy-message-vault" };
  }

  if (normalized === "get value") {
    return { kind: "get-message" };
  }

  if (normalized === "show history" || normalized === "history" || normalized === "logs") {
    return { kind: "history" };
  }

  if (normalized === "main menu" || normalized === "menu") {
    return { kind: "menu" };
  }

  const setValue = parseSetValue(command);
  if (setValue !== null) {
    return {
      kind: "set-message",
      value: setValue
    };
  }

  const finalizeDeploy = parseFinalizeDeploy(command);
  if (finalizeDeploy) {
    return {
      kind: "finalize-deploy",
      ...finalizeDeploy
    };
  }

  const importBroadcast = parseImportBroadcast(command);
  if (importBroadcast) {
    return {
      kind: "import-deploy-broadcast",
      ...importBroadcast
    };
  }

  return {
    kind: "invalid",
    error:
      "Unsupported command. Try: deploy contract, get value, set value <text>, finalize deploy <forgeRunId> <txHash>, import broadcast <forgeRunId>, show history."
  };
}
