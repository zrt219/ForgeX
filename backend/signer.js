import { runExecStream } from "./cli-runner.js";

function normalizeValue(value) {
  return String(value ?? "").trim();
}

function quoteForShell(value) {
  if (/^[a-zA-Z0-9_./:=+-]+$/u.test(value)) {
    return value;
  }

  return `"${String(value).replace(/"/gu, '\\"')}"`;
}

function formatCommand(command, args) {
  return [command, ...args].map(quoteForShell).join(" ");
}

function redactPrivateKeyArgs(args, privateKey) {
  return args.map((entry) => (entry === privateKey ? "<private-key-hidden>" : entry));
}

function parseAddress(text) {
  return text.match(/0x[a-fA-F0-9]{40}/u)?.[0] || null;
}

function parseTxHash(text) {
  return text.match(/0x[a-fA-F0-9]{64}/u)?.[0] || null;
}

async function runWithTimeout(input, timeoutMs) {
  const timeout = new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        ok: false,
        stdout: "",
        stderr: "",
        timedOut: true
      });
    }, timeoutMs);
  });

  return Promise.race([runExecStream(input), timeout]);
}

export function createSignerAdapter({ config, env, root }) {
  function resolveExternalSignerIdentity() {
    const accountAlias = normalizeValue(config.externalSigner?.accountAlias);
    const senderAddress = normalizeValue(config.externalSigner?.senderAddress);
    const missing = [];

    if (!accountAlias) {
      missing.push("FORGEX_EXTERNAL_ACCOUNT_ALIAS");
    }

    if (!senderAddress) {
      missing.push("FORGEX_EXTERNAL_SENDER_ADDRESS");
    }

    return {
      accountAlias: accountAlias || "<foundry-account-alias>",
      senderAddress: senderAddress || "<operator-address>",
      missing,
      isRunnable: missing.length === 0
    };
  }

  function externalEnvelope(kind, args, hints = {}) {
    const command = kind === "deploy" ? config.foundry.forgeBin : config.foundry.castBin;
    return {
      signerMode: "external",
      approvalRequired: true,
      command,
      args,
      commandPreview: formatCommand(command, args),
      hints
    };
  }

  async function executeDeployDev() {
    const privateKey = normalizeValue(env.PRIVATE_KEY);
    if (!config.allowDevSigner || !privateKey) {
      throw new Error("Dev signer is disabled. Configure an external signer or enable dev signer explicitly.");
    }

    const args = [
      "script",
      "script/Deploy.s.sol:DeployScript",
      "--rpc-url",
      config.xrpl.rpcUrl,
      "--private-key",
      privateKey,
      "--broadcast",
      "--legacy"
    ];

    const result = await runWithTimeout(
      {
        command: config.foundry.forgeBin,
        args: [...config.foundry.forgeArgs, ...args],
        cwd: root,
        env,
        writer: null,
        label: "deploy"
      },
      config.security.childTimeoutMs
    );

    if (!result.ok) {
      throw new Error(result.timedOut ? "Forge deploy timed out." : (result.stderr || result.stdout || "Forge deploy failed."));
    }

    const combined = `${result.stdout}\n${result.stderr}`.trim();
    return {
      commandPreview: formatCommand(
        config.foundry.forgeBin,
        [...config.foundry.forgeArgs, ...redactPrivateKeyArgs(args, privateKey)]
      ),
      txHash: parseTxHash(combined),
      contractAddress: parseAddress(combined),
      rawOutput: combined
    };
  }

  async function executeSetMessageDev(payload) {
    const privateKey = normalizeValue(env.PRIVATE_KEY);
    if (!config.allowDevSigner || !privateKey) {
      throw new Error("Dev signer is disabled. Configure an external signer or enable dev signer explicitly.");
    }

    const args = [
      "send",
      payload.contractAddress,
      "setMessage(string,bytes32)",
      payload.message,
      payload.runDigest,
      "--rpc-url",
      config.xrpl.rpcUrl,
      "--private-key",
      privateKey,
      "--legacy"
    ];

    const result = await runWithTimeout(
      {
        command: config.foundry.castBin,
        args: [...config.foundry.castArgs, ...args],
        cwd: root,
        env,
        writer: null,
        label: "set-message"
      },
      config.security.childTimeoutMs
    );

    if (!result.ok) {
      throw new Error(result.timedOut ? "ForgeX write timed out." : (result.stderr || result.stdout || "ForgeX write failed."));
    }

    const combined = `${result.stdout}\n${result.stderr}`.trim();
    return {
      commandPreview: formatCommand(
        config.foundry.castBin,
        [...config.foundry.castArgs, ...redactPrivateKeyArgs(args, privateKey)]
      ),
      txHash: parseTxHash(combined),
      contractAddress: payload.contractAddress,
      rawOutput: combined
    };
  }

  return {
    mode: config.signerMode,
    async prepareDeployRun() {
      if (config.signerMode === "dev-private-key") {
        return { signerMode: "dev-private-key", approvalRequired: false };
      }

      const signerIdentity = resolveExternalSignerIdentity();
      return externalEnvelope(
        "deploy",
        [
          ...config.foundry.forgeArgs,
          "script",
          "script/Deploy.s.sol:DeployScript",
          "--rpc-url",
          config.xrpl.rpcUrl,
          "--broadcast",
          "--account",
          signerIdentity.accountAlias,
          "--sender",
          signerIdentity.senderAddress,
          "--legacy"
        ],
        {
          signerBoundary: "Operator executes this command locally with a Foundry-managed signer.",
          missingSignerFields: signerIdentity.missing,
          isRunnable: signerIdentity.isRunnable,
          nextStep: signerIdentity.isRunnable
            ? "Run this command in your local terminal, then paste the resulting transaction hash or import the Foundry broadcast to finalize the deployment."
            : `Set ${signerIdentity.missing.join(" and ")} in .env or replace the placeholders in the copied command before running it locally. After it broadcasts, paste the transaction hash or import the Foundry broadcast.`
        }
      );
    },
    async prepareSetMessageRun(payload) {
      if (config.signerMode === "dev-private-key") {
        return { signerMode: "dev-private-key", approvalRequired: false, payload };
      }

      const signerIdentity = resolveExternalSignerIdentity();
      return externalEnvelope(
        "write",
        [
          ...config.foundry.castArgs,
          "send",
          payload.contractAddress,
          "setMessage(string,bytes32)",
          payload.message,
          payload.runDigest,
          "--rpc-url",
          config.xrpl.rpcUrl,
          "--account",
          signerIdentity.accountAlias,
          "--sender",
          signerIdentity.senderAddress,
          "--legacy"
        ],
        {
          signerBoundary: "Operator signs the write from a local wallet or Foundry account.",
          missingSignerFields: signerIdentity.missing,
          isRunnable: signerIdentity.isRunnable,
          nextStep: signerIdentity.isRunnable
            ? "Run this command in your local terminal with the configured Foundry account."
            : `Set ${signerIdentity.missing.join(" and ")} in .env or replace the placeholders in the copied command before running it locally.`
        }
      );
    },
    async executeDeployIfAllowed() {
      return executeDeployDev();
    },
    async executeSetMessageIfAllowed(payload) {
      return executeSetMessageDev(payload);
    }
  };
}
