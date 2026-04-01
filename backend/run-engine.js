import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { runExecStream } from "./cli-runner.js";
import { XRPL_TESTNET_EXPLORER } from "./config.js";

const MOUNTAIN = "\u{1F5FB}";
export const RESULT_STATUS = Object.freeze({
  IDLE: "idle",
  PREFLIGHT_FAILED: "preflight_failed",
  PREPARED: "prepared",
  AWAITING_SIGNATURE: "awaiting_signature",
  BROADCAST_SUBMITTED: "broadcast_submitted",
  CONFIRMING: "confirming",
  CONFIRMED: "confirmed",
  FAILED: "failed",
  ABANDONED: "abandoned"
});

function nowIso() {
  return new Date().toISOString();
}

function digestText(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createForgeRunId() {
  return `forgeRun_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function createDeploymentId() {
  return `deployment_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function buildActionFlags({
  status,
  contractAddress = "",
  transactionHash = null,
  command = null,
  canFinalizeDeploy = false,
  canImportBroadcast = false
}) {
  const confirmed = status === RESULT_STATUS.CONFIRMED;

  return {
    canViewTransaction: confirmed && Boolean(transactionHash),
    canOpenContract: confirmed && Boolean(contractAddress),
    canOpenReadWrite: confirmed && Boolean(contractAddress),
    canCopyAddress: confirmed && Boolean(contractAddress),
    canCopyTransaction: confirmed && Boolean(transactionHash),
    canCopyCommand: Boolean(command),
    canFinalizeDeploy,
    canImportBroadcast
  };
}

function summarizeReceipt(receipt) {
  if (!receipt) {
    return null;
  }

  return {
    blockNumber: receipt.blockNumber ? Number.parseInt(receipt.blockNumber, 16) : null,
    gasUsed: receipt.gasUsed || null,
    status: receipt.status || null,
    transactionHash: receipt.transactionHash || null,
    contractAddress: receipt.contractAddress || null
  };
}

function buildResult({
  success,
  status,
  phase = status,
  mode = "external",
  runId = null,
  message = "",
  receipt = null,
  command = null,
  finalOutput,
  contractAddress = "",
  transactionHash = null,
  nextActions = [],
  nextStep = "",
  actions = null,
  explorer = null,
  error = null,
  shareText = "",
  metadata = {}
}) {
  const explorerBase = explorer?.baseUrl || XRPL_TESTNET_EXPLORER;
  const resolvedActions =
    actions ||
    buildActionFlags({
      status,
      contractAddress,
      transactionHash,
      command
    });

  return {
    success,
    mode,
    phase,
    status,
    message,
    runId,
    contractAddress,
    transactionHash,
    receipt,
    command,
    explorer: {
      baseUrl: explorerBase,
      txUrl: transactionHash ? `${explorerBase}/tx/${transactionHash}` : null,
      addressUrl: contractAddress ? `${explorerBase}/address/${contractAddress}` : null
    },
    finalOutput,
    shareText,
    nextActions,
    nextStep,
    actions: resolvedActions,
    error,
    metadata
  };
}

function buildShareText(address, txHash) {
  const lines = [`${MOUNTAIN} ForgeX`, "", `${address} is now permanent.`];
  if (txHash) {
    lines.push(txHash);
  }
  lines.push("", "#ForgeX");
  return lines.join("\n");
}

function buildPreparedDeployOutput(forgeRunId, commandPreview, setupNote = "") {
  const lines = [
    `${MOUNTAIN} Deployment prepared`,
    "",
    `Run: ${forgeRunId}`,
    "",
    "Deployment prepared. ForgeX has not yet confirmed an on-chain contract address.",
    "",
    "Operator action required:"
  ];

  if (setupNote) {
    lines.push(setupNote, "");
  }

  lines.push(commandPreview);
  return lines.join("\n");
}

function buildConfirmedDeployOutput(address, forgeRunId) {
  return [
    `${MOUNTAIN} ForgeX`,
    "",
    `Run: ${forgeRunId}`,
    "",
    "Contract:",
    address,
    "",
    "is now permanent."
  ].join("\n");
}

function buildValueOutput(currentValue, forgeRunId, confirmed = true) {
  return [
    confirmed ? `${MOUNTAIN} Value confirmed.` : `${MOUNTAIN} Value prepared.`,
    "",
    `Run: ${forgeRunId}`,
    "",
    "Current value:",
    currentValue || ""
  ].join("\n");
}

function buildCommandPreviewOutput(title, forgeRunId, commandPreview, setupNote = "") {
  const lines = [
    `${MOUNTAIN} ${title}`,
    "",
    `Run: ${forgeRunId}`,
    "",
    "Operator action required:"
  ];

  if (setupNote) {
    lines.push(setupNote, "");
  }

  lines.push(commandPreview);
  return lines.join("\n");
}

function parseHexString(output) {
  return String(output || "").trim();
}

async function withTimeout(promiseFactory, timeoutMs) {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Operation timed out.")), timeoutMs);
  });

  return Promise.race([promiseFactory(), timeout]);
}

async function fetchJsonRpc(config, method, params) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.security.rpcTimeoutMs);

    try {
      const response = await fetch(config.xrpl.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`RPC returned HTTP ${response.status}.`);
      }

      const body = await response.json();
      if (body.error) {
        throw new Error(body.error.message || "RPC error.");
      }

      return body.result;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(
    `ForgeX could not reach XRPL RPC after 3 attempts. Verify ${config.xrpl.rpcUrl} is reachable, then retry. ${lastError instanceof Error ? lastError.message : ""}`.trim()
  );
}

async function fetchChainId(config) {
  const result = await fetchJsonRpc(config, "eth_chainId", []);
  return Number.parseInt(result, 16);
}

async function waitForReceipt(config, txHash) {
  if (config.security.assumeReceiptInDev && config.signerMode === "dev-private-key") {
    return {
      status: "0x1",
      transactionHash: txHash,
      contractAddress: null
    };
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < config.security.confirmationTimeoutMs) {
    const receipt = await fetchJsonRpc(config, "eth_getTransactionReceipt", [txHash]);
    if (receipt) {
      return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, config.security.confirmationPollMs));
  }
  throw new Error("Timed out waiting for transaction receipt.");
}

function isTxHash(value) {
  return /^0x[a-fA-F0-9]{64}$/u.test(String(value || "").trim());
}

async function fetchReceiptByHash(config, txHash) {
  return fetchJsonRpc(config, "eth_getTransactionReceipt", [txHash]);
}

async function castCall({ config, root, env, contractAddress, signature, args = [] }) {
  const result = await withTimeout(
    () =>
      runExecStream({
        command: config.foundry.castBin,
        args: [...config.foundry.castArgs, "call", contractAddress, signature, ...args, "--rpc-url", config.xrpl.rpcUrl],
        cwd: root,
        env,
        writer: null,
        label: "cast-call"
      }),
    config.security.childTimeoutMs
  );

  if (!result.ok) {
    throw new Error(result.stderr || result.stdout || "Cast call failed.");
  }

  return parseHexString(`${result.stdout}\n${result.stderr}`.trim());
}

export class RunEngine {
  constructor({ root, env, config, store, signer }) {
    this.root = root;
    this.env = env;
    this.config = config;
    this.store = store;
    this.signer = signer;
    this.activeWriteRuns = 0;
    this.activeReadRuns = 0;
  }

  createEnvelope(runType, actorId, payload = {}) {
    const envelope = {
      runType,
      actorId,
      payload,
      chainId: this.config.xrpl.chainId,
      rpcProfile: "xrpl-testnet",
      createdAt: nowIso()
    };

    return {
      envelope,
      requestHash: digestText(JSON.stringify(envelope))
    };
  }

  createOrReuseRun({ runType, actorId, payload, idempotencyKey, targetContract = null, allowedAction }) {
    const { envelope, requestHash } = this.createEnvelope(runType, actorId, payload);
    const existing = this.store.findExistingRun(actorId, idempotencyKey, requestHash);
    if (existing) {
      return existing;
    }

    return this.store.createRun({
      forgeRunId: createForgeRunId(),
      idempotencyKey,
      requestHash,
      actorId,
      runType,
      status: "accepted",
      signerMode: this.signer.mode,
      chainId: this.config.xrpl.chainId,
      rpcProfile: "xrpl-testnet",
      targetContract,
      allowedAction,
      envelope
    });
  }

  ensureWriteCapacity() {
    if (this.activeWriteRuns >= this.config.security.maxConcurrentWriteRuns) {
      throw new Error("ForgeX is already processing a write run. Wait for it to finish.");
    }
  }

  async ensureChainProfile() {
    const chainId = await fetchChainId(this.config);
    if (chainId !== this.config.xrpl.chainId) {
      throw new Error(
        `ForgeX detected the wrong network. Expected chain ${this.config.xrpl.chainId}, received ${chainId}. Fix XRPL_RPC_URL in .env and retry.`
      );
    }
  }

  async runPreflight({ requireForge = false, requireCast = false } = {}) {
    await this.ensureChainProfile();

    if (requireForge) {
      await withTimeout(
        () =>
          runExecStream({
            command: this.config.foundry.forgeBin,
            args: [...this.config.foundry.forgeArgs, "--version"],
            cwd: this.root,
            env: this.env,
            writer: null,
            label: "forge-preflight"
          }),
        this.config.security.childTimeoutMs
      ).then((result) => {
        if (!result.ok) {
          throw new Error(
            "ForgeX could not find forge. Install Foundry and verify `forge --version` works in your terminal, then retry."
          );
        }
      });
    }

    if (requireCast) {
      await withTimeout(
        () =>
          runExecStream({
            command: this.config.foundry.castBin,
            args: [...this.config.foundry.castArgs, "--version"],
            cwd: this.root,
            env: this.env,
            writer: null,
            label: "cast-preflight"
          }),
        this.config.security.childTimeoutMs
      ).then((result) => {
        if (!result.ok) {
          throw new Error(
            "ForgeX could not find cast. Install Foundry and verify `cast --version` works in your terminal, then retry."
          );
        }
      });
    }
  }

  getDefaultDeployment() {
    const deployment = this.store.getLatestDeployment();
    if (!deployment) {
      throw new Error("No deployment is registered. Deploy ForgeXMessageVault first.");
    }
    return deployment;
  }

  findDeploymentByAddressOrHash({ contractAddress = null, txHash = null }) {
    const normalizedAddress = contractAddress ? String(contractAddress).toLowerCase() : null;
    const normalizedHash = txHash ? String(txHash).toLowerCase() : null;

    return (
      this.store.listDeployments().find((entry) => {
        const entryAddress = entry.contractAddress ? String(entry.contractAddress).toLowerCase() : null;
        const entryHash = entry.txHash ? String(entry.txHash).toLowerCase() : null;
        return (normalizedAddress && entryAddress === normalizedAddress) || (normalizedHash && entryHash === normalizedHash);
      }) || null
    );
  }

  async verifyMessageVaultDeployment(contractAddress) {
    const deploymentId = await castCall({
      config: this.config,
      root: this.root,
      env: this.env,
      contractAddress,
      signature: "DEPLOYMENT_ID()(bytes32)"
    });

    if (!deploymentId || !deploymentId.startsWith("0x")) {
      throw new Error("ForgeX could not verify the deployed address as a ForgeXMessageVault.");
    }

    return deploymentId;
  }

  async finalizePreparedDeploy({ actorId, idempotencyKey, forgeRunId, txHash }) {
    const run = this.store.getRun(forgeRunId);
    if (!run) {
      throw new Error("ForgeX could not find that deployment run.");
    }

    if (run.runType !== "deploy-message-vault") {
      throw new Error("Only deploy runs can be finalized.");
    }

    if (run.resultSnapshot?.status === RESULT_STATUS.CONFIRMED || run.status === RESULT_STATUS.CONFIRMED) {
      return this.describeRun(forgeRunId);
    }

    if (!isTxHash(txHash)) {
      throw new Error("ForgeX requires a valid transaction hash. Paste a 0x-prefixed 32-byte tx hash and retry.");
    }

    const currentPreparedSnapshot = run.resultSnapshot || null;

    try {
      await this.runPreflight({ requireCast: true });

      this.store.setRunStatus(forgeRunId, RESULT_STATUS.CONFIRMING, {
        txHash,
        message: "Reconciling external deployment from the supplied transaction hash."
      });

      const receipt = await fetchReceiptByHash(this.config, txHash);
      if (!receipt) {
        throw new Error("ForgeX could not find a receipt for that transaction hash yet. Wait for confirmation, then retry.");
      }

      if (receipt.status === "0x0") {
        const failedResult = buildResult({
          success: false,
          mode: "external",
          phase: RESULT_STATUS.FAILED,
          status: RESULT_STATUS.FAILED,
          message: "Deployment transaction reverted on XRPL.",
          runId: forgeRunId,
          transactionHash: txHash,
          receipt: summarizeReceipt(receipt),
          finalOutput: [
            `${MOUNTAIN} Deployment failed`,
            "",
            `Run: ${forgeRunId}`,
            "",
            "ForgeX found a receipt for the supplied transaction hash, but the deployment reverted.",
            "",
            `Tx: ${txHash}`
          ].join("\n"),
          nextActions: ["Deploy again", "Show history"],
          nextStep: "Fix the failing deploy command, then prepare and run a new deployment.",
          error: "Deployment reverted on-chain."
        });

        this.store.setRunStatus(forgeRunId, RESULT_STATUS.FAILED, {
          txHash,
          errorMessage: "Deployment reverted on-chain.",
          resultSnapshot: failedResult,
          message: "External deployment finalized as failed from the supplied receipt."
        });
        return this.describeRun(forgeRunId);
      }

      const contractAddress = receipt.contractAddress;
      if (!contractAddress) {
        throw new Error("The supplied transaction hash did not resolve to a contract deployment receipt.");
      }

      const deploymentId =
        this.findDeploymentByAddressOrHash({ contractAddress, txHash })?.deploymentId || createDeploymentId();
      const verifiedDeploymentId = await this.verifyMessageVaultDeployment(contractAddress);

      this.store.saveDeployment({
        deploymentId,
        contractName: "ForgeXMessageVault",
        contractAddress,
        chainId: this.config.xrpl.chainId,
        txHash,
        registeredBy: actorId,
        metadata: {
          forgeRunId,
          signerMode: "external",
          source: "external-signer",
          verifiedDeploymentId,
          receipt: summarizeReceipt(receipt),
          script: "script/Deploy.s.sol:DeployScript"
        }
      });

      const resultSnapshot = buildResult({
        success: true,
        mode: "external",
        phase: RESULT_STATUS.CONFIRMED,
        status: RESULT_STATUS.CONFIRMED,
        message: "Deployment confirmed on XRPL.",
        runId: forgeRunId,
        contractAddress,
        transactionHash: txHash,
        receipt: summarizeReceipt(receipt),
        finalOutput: buildConfirmedDeployOutput(contractAddress, forgeRunId),
        nextActions: ["Get value", "Set value", "Deploy again", "Show history"],
        nextStep: "Continue with reads, writes, or explorer inspection from the confirmed deployment.",
        shareText: buildShareText(contractAddress, txHash),
        metadata: {
          deploymentId,
          verifiedDeploymentId
        }
      });

      this.store.setRunStatus(forgeRunId, RESULT_STATUS.CONFIRMED, {
        txHash,
        contractAddress,
        deploymentId,
        resultSnapshot,
        finalized: true,
        message: "External deployment confirmed from the supplied transaction hash."
      });

      return this.describeRun(forgeRunId);
    } catch (error) {
      if (currentPreparedSnapshot) {
        this.store.setRunStatus(forgeRunId, RESULT_STATUS.PREPARED, {
          resultSnapshot: currentPreparedSnapshot,
          txHash: null,
          message: "Deployment remains prepared until ForgeX can confirm a valid on-chain receipt."
        });
      }
      throw error;
    }
  }

  async finalizePreparedDeployFromBroadcast({ actorId, idempotencyKey, forgeRunId, broadcastPath = null }) {
    const defaultPath = path.join(
      this.root,
      "broadcast",
      "Deploy.s.sol",
      String(this.config.xrpl.chainId),
      "run-latest.json"
    );
    const targetPath = broadcastPath ? path.resolve(this.root, broadcastPath) : defaultPath;

    let artifact;
    try {
      artifact = JSON.parse(await fs.promises.readFile(targetPath, "utf8"));
    } catch {
      throw new Error(`ForgeX could not read a Foundry broadcast artifact at ${targetPath}.`);
    }

    const txHash =
      artifact?.receipts?.[0]?.transactionHash ||
      artifact?.transactions?.find((entry) => entry.transactionType === "CREATE")?.hash ||
      artifact?.transactions?.[0]?.hash;

    if (!isTxHash(txHash)) {
      throw new Error("ForgeX could not extract a valid deployment transaction hash from the Foundry broadcast artifact.");
    }

    return this.finalizePreparedDeploy({
      actorId,
      idempotencyKey,
      forgeRunId,
      txHash
    });
  }

  async deployMessageVault({ actorId, idempotencyKey, initialMessage }) {
    this.ensureWriteCapacity();
    this.activeWriteRuns += 1;

    try {
      const run = this.createOrReuseRun({
        runType: "deploy-message-vault",
        actorId,
        payload: { initialMessage },
        idempotencyKey,
        allowedAction: "deploy:ForgeXMessageVault"
      });

      if (run.status !== "accepted") {
        return this.describeRun(run.forgeRunId);
      }

      this.store.setRunStatus(run.forgeRunId, "validated", { message: "Run validated." });
      await this.runPreflight({ requireForge: true });
      this.store.setRunStatus(run.forgeRunId, "simulated", { message: "Chain profile confirmed." });

      const prepared = await this.signer.prepareDeployRun({ initialMessage, forgeRunId: run.forgeRunId });
      if (prepared.approvalRequired) {
        const setupNote = prepared.hints?.isRunnable
          ? "This command is ready to run with your configured external signer."
          : `This command still contains placeholders. Configure ${prepared.hints?.missingSignerFields?.join(" and ") || "the external signer values"} or replace them before running it.`;
        const resultSnapshot = buildResult({
          success: true,
          mode: "external",
          phase: RESULT_STATUS.PREPARED,
          status: RESULT_STATUS.PREPARED,
          message: "Deployment command prepared. Awaiting external execution.",
          runId: run.forgeRunId,
          command: prepared.commandPreview,
          finalOutput: buildPreparedDeployOutput(run.forgeRunId, prepared.commandPreview, setupNote),
          nextActions: ["Main menu", "Show history"],
          nextStep:
            prepared.hints?.nextStep ||
            "Run the prepared command externally, then finalize the deployment with the resulting transaction hash.",
          actions: buildActionFlags({
            status: RESULT_STATUS.PREPARED,
            command: prepared.commandPreview,
            canFinalizeDeploy: true,
            canImportBroadcast: true
          }),
          metadata: {
            signerMode: prepared.signerMode,
            commandPreview: prepared.commandPreview,
            signerHints: prepared.hints || {}
          }
        });
        this.store.setRunStatus(run.forgeRunId, RESULT_STATUS.PREPARED, {
          resultSnapshot,
          message: "Deployment prepared and awaiting external execution."
        });
        return this.describeRun(run.forgeRunId);
      }

      this.store.setRunStatus(run.forgeRunId, "submitted", { message: "Submitting deploy through local signer." });
      const executed = await this.signer.executeDeployIfAllowed();
      if (!executed.txHash) {
        throw new Error("Deploy completed without a transaction hash.");
      }

      const receipt = await waitForReceipt(this.config, executed.txHash);
      const contractAddress = receipt.contractAddress || executed.contractAddress;
      if (!contractAddress) {
        throw new Error("Deploy receipt did not include a contract address.");
      }

      const deploymentId = createDeploymentId();
      this.store.saveDeployment({
        deploymentId,
        contractName: "ForgeXMessageVault",
        contractAddress,
        chainId: this.config.xrpl.chainId,
        txHash: executed.txHash,
        registeredBy: actorId,
        metadata: {
          forgeRunId: run.forgeRunId,
          signerMode: "dev-private-key"
        }
      });

      const resultSnapshot = buildResult({
        success: true,
        mode: "dev-private-key",
        phase: RESULT_STATUS.CONFIRMED,
        status: RESULT_STATUS.CONFIRMED,
        message: "Deployment confirmed on XRPL.",
        runId: run.forgeRunId,
        contractAddress,
        transactionHash: executed.txHash,
        receipt: summarizeReceipt(receipt),
        finalOutput: buildConfirmedDeployOutput(contractAddress, run.forgeRunId),
        nextActions: ["Get value", "Set value", "Deploy again", "Show history"],
        nextStep: "Continue with reads, writes, or explorer inspection from the confirmed deployment.",
        shareText: buildShareText(contractAddress, executed.txHash),
        metadata: {
          deploymentId,
          commandPreview: executed.commandPreview
        }
      });

      this.store.setRunStatus(run.forgeRunId, RESULT_STATUS.CONFIRMED, {
        txHash: executed.txHash,
        contractAddress,
        deploymentId,
        resultSnapshot,
        finalized: true,
        message: "Deploy confirmed from receipt."
      });

      return this.describeRun(run.forgeRunId);
    } finally {
      this.activeWriteRuns = Math.max(0, this.activeWriteRuns - 1);
    }
  }

  async setMessage({ actorId, idempotencyKey, message, deploymentId }) {
    this.ensureWriteCapacity();
    this.activeWriteRuns += 1;

    try {
      const deployment = deploymentId ? this.store.getDeployment(deploymentId) : this.getDefaultDeployment();
      if (!deployment) {
        throw new Error("Deployment not found.");
      }

      const run = this.createOrReuseRun({
        runType: "set-message",
        actorId,
        payload: { message, deploymentId: deployment.deploymentId },
        idempotencyKey,
        targetContract: deployment.contractAddress,
        allowedAction: "write:setMessage"
      });

      if (run.status !== "accepted") {
        return this.describeRun(run.forgeRunId);
      }

      this.store.setRunStatus(run.forgeRunId, "validated", { message: "Write run validated." });
      await this.runPreflight({ requireCast: true });
      this.store.setRunStatus(run.forgeRunId, "simulated", { message: "XRPL chain confirmed." });

      const runDigest = `0x${digestText(run.forgeRunId)}`;
      const prepared = await this.signer.prepareSetMessageRun({
        contractAddress: deployment.contractAddress,
        message,
        runDigest
      });

      if (prepared.approvalRequired) {
        const setupNote = prepared.hints?.isRunnable
          ? "This command is ready to run with your configured external signer."
          : `This command still contains placeholders. Configure ${prepared.hints?.missingSignerFields?.join(" and ") || "the external signer values"} or replace them before running it.`;
        const resultSnapshot = buildResult({
          success: true,
          mode: "external",
          phase: RESULT_STATUS.PREPARED,
          status: RESULT_STATUS.PREPARED,
          message: "Write command prepared. Awaiting external execution.",
          runId: run.forgeRunId,
          command: prepared.commandPreview,
          contractAddress: deployment.contractAddress,
          finalOutput: buildCommandPreviewOutput("Write prepared", run.forgeRunId, prepared.commandPreview, setupNote),
          nextActions: ["Get value", "Show history"],
          nextStep:
            prepared.hints?.nextStep ||
            "Run the prepared write command externally, then confirm the resulting transaction in your wallet or terminal.",
          actions: buildActionFlags({
            status: RESULT_STATUS.PREPARED,
            command: prepared.commandPreview
          }),
          metadata: {
            signerMode: prepared.signerMode,
            commandPreview: prepared.commandPreview,
            deploymentId: deployment.deploymentId,
            signerHints: prepared.hints || {}
          }
        });
        this.store.setRunStatus(run.forgeRunId, RESULT_STATUS.PREPARED, {
          resultSnapshot,
          contractAddress: deployment.contractAddress,
          deploymentId: deployment.deploymentId,
          message: "Write prepared and awaiting external execution."
        });
        return this.describeRun(run.forgeRunId);
      }

      this.store.setRunStatus(run.forgeRunId, "submitted", {
        contractAddress: deployment.contractAddress,
        deploymentId: deployment.deploymentId,
        message: "Submitting write through local signer."
      });

      const executed = await this.signer.executeSetMessageIfAllowed({
        contractAddress: deployment.contractAddress,
        message,
        runDigest
      });

      const receipt = await waitForReceipt(this.config, executed.txHash);
      if (!receipt || receipt.status === "0x0") {
        throw new Error("Transaction reverted or receipt was invalid.");
      }

      const currentValue = await castCall({
        config: this.config,
        root: this.root,
        env: this.env,
        contractAddress: deployment.contractAddress,
        signature: "getMessage()(string)"
      });

      const resultSnapshot = buildResult({
        success: true,
        mode: this.signer.mode,
        phase: RESULT_STATUS.CONFIRMED,
        status: RESULT_STATUS.CONFIRMED,
        message: "Write confirmed on XRPL.",
        runId: run.forgeRunId,
        contractAddress: deployment.contractAddress,
        transactionHash: executed.txHash,
        receipt: summarizeReceipt(receipt),
        finalOutput: buildValueOutput(currentValue, run.forgeRunId, true),
        nextActions: ["Get value", "Set value", "Show history"],
        nextStep: "The confirmed write is now reflected in the latest on-chain readback.",
        shareText: buildShareText(deployment.contractAddress, executed.txHash),
        metadata: {
          deploymentId: deployment.deploymentId,
          commandPreview: executed.commandPreview
        }
      });

      this.store.setRunStatus(run.forgeRunId, RESULT_STATUS.CONFIRMED, {
        txHash: executed.txHash,
        contractAddress: deployment.contractAddress,
        deploymentId: deployment.deploymentId,
        resultSnapshot,
        finalized: true,
        message: "Write confirmed from receipt."
      });

      return this.describeRun(run.forgeRunId);
    } finally {
      this.activeWriteRuns = Math.max(0, this.activeWriteRuns - 1);
    }
  }

  async getMessage({ actorId, idempotencyKey, deploymentId }) {
    if (this.activeReadRuns >= this.config.security.maxConcurrentReadRuns) {
      throw new Error("ForgeX is already processing the maximum number of read runs.");
    }
    this.activeReadRuns += 1;

    try {
      const deployment = deploymentId ? this.store.getDeployment(deploymentId) : this.getDefaultDeployment();
      if (!deployment) {
        throw new Error("Deployment not found.");
      }

      const run = this.createOrReuseRun({
        runType: "get-message",
        actorId,
        payload: { deploymentId: deployment.deploymentId },
        idempotencyKey,
        targetContract: deployment.contractAddress,
        allowedAction: "read:getMessage"
      });

      if (run.status !== "accepted") {
        return this.describeRun(run.forgeRunId);
      }

      this.store.setRunStatus(run.forgeRunId, "validated", {
        contractAddress: deployment.contractAddress,
        deploymentId: deployment.deploymentId,
        message: "Read run validated."
      });
      await this.runPreflight({ requireCast: true });

      const currentValue = await castCall({
        config: this.config,
        root: this.root,
        env: this.env,
        contractAddress: deployment.contractAddress,
        signature: "getMessage()(string)"
      });

      const resultSnapshot = buildResult({
        success: true,
        mode: "read",
        phase: RESULT_STATUS.CONFIRMED,
        status: RESULT_STATUS.CONFIRMED,
        message: "Read confirmed from chain state.",
        runId: run.forgeRunId,
        contractAddress: deployment.contractAddress,
        finalOutput: buildValueOutput(currentValue, run.forgeRunId, true),
        nextActions: ["Set value", "Show history", "Deploy again"],
        nextStep: "The displayed value was read back from the configured XRPL EVM chain.",
        metadata: {
          deploymentId: deployment.deploymentId,
          chainId: this.config.xrpl.chainId
        }
      });

      this.store.setRunStatus(run.forgeRunId, RESULT_STATUS.CONFIRMED, {
        contractAddress: deployment.contractAddress,
        deploymentId: deployment.deploymentId,
        resultSnapshot,
        finalized: true,
        message: "Read confirmed from chain state."
      });

      return this.describeRun(run.forgeRunId);
    } finally {
      this.activeReadRuns = Math.max(0, this.activeReadRuns - 1);
    }
  }

  describeRun(forgeRunId) {
    const run = this.store.getRun(forgeRunId);
    if (!run) {
      throw new Error("Run not found.");
    }

    return {
      ...run,
      events: this.store.listRunEvents(forgeRunId)
    };
  }

  listDeployments() {
    return this.store.listDeployments();
  }

  getDeployment(deploymentId) {
    return this.store.getDeployment(deploymentId);
  }

  listRecentRuns() {
    const deployments = this.store.listDeployments();
    return deployments;
  }
}
