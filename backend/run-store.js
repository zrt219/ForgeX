import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function normalizeRunRecord(row) {
  if (!row) {
    return null;
  }

  return {
    forgeRunId: row.forgeRunId,
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    actorId: row.actorId,
    runType: row.runType,
    status: row.status,
    signerMode: row.signerMode,
    chainId: row.chainId,
    rpcProfile: row.rpcProfile,
    targetContract: row.targetContract || null,
    allowedAction: row.allowedAction,
    txHash: row.txHash || null,
    contractAddress: row.contractAddress || null,
    deploymentId: row.deploymentId || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    finalizedAt: row.finalizedAt || null,
    errorMessage: row.errorMessage || null,
    envelope: clone(row.envelope || {}),
    resultSnapshot: row.resultSnapshot ? clone(row.resultSnapshot) : null
  };
}

function normalizeDeploymentRecord(row) {
  if (!row) {
    return null;
  }

  return {
    deploymentId: row.deploymentId,
    contractName: row.contractName,
    contractAddress: row.contractAddress,
    chainId: row.chainId,
    txHash: row.txHash || null,
    registeredBy: row.registeredBy,
    createdAt: row.createdAt,
    metadata: clone(row.metadata || {})
  };
}

function normalizeEventRecord(row) {
  return {
    id: row.id,
    forgeRunId: row.forgeRunId,
    status: row.status,
    message: row.message,
    data: clone(row.data || {}),
    createdAt: row.createdAt
  };
}

class JsonFallbackRunStore {
  constructor(filePath) {
    this.filePath = filePath.endsWith(".json") ? filePath : `${filePath}.json`;
    ensureParent(this.filePath);
    if (!fs.existsSync(this.filePath)) {
      this.writeState({
        runs: [],
        runEvents: [],
        deployments: [],
        nextEventId: 1
      });
    }
  }

  readState() {
    return parseJson(fs.readFileSync(this.filePath, "utf8"), {
      runs: [],
      runEvents: [],
      deployments: [],
      nextEventId: 1
    });
  }

  writeState(state) {
    fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf8");
  }

  createRun(record) {
    const state = this.readState();
    const createdAt = nowIso();
    const row = {
      forgeRunId: record.forgeRunId,
      idempotencyKey: record.idempotencyKey,
      requestHash: record.requestHash,
      actorId: record.actorId,
      runType: record.runType,
      status: record.status,
      signerMode: record.signerMode,
      chainId: record.chainId,
      rpcProfile: record.rpcProfile,
      targetContract: record.targetContract || null,
      allowedAction: record.allowedAction,
      txHash: null,
      contractAddress: null,
      deploymentId: null,
      envelope: clone(record.envelope || {}),
      resultSnapshot: null,
      errorMessage: null,
      createdAt,
      updatedAt: createdAt,
      finalizedAt: null
    };

    state.runs.push(row);
    this.appendEventInternal(state, row.forgeRunId, row.status, "Run accepted.", {
      runType: row.runType,
      allowedAction: row.allowedAction
    });
    this.writeState(state);
    return normalizeRunRecord(row);
  }

  appendEventInternal(state, forgeRunId, status, message, data = {}) {
    state.runEvents.push({
      id: state.nextEventId,
      forgeRunId,
      status,
      message,
      data: clone(data),
      createdAt: nowIso()
    });
    state.nextEventId += 1;
  }

  appendEvent(forgeRunId, status, message, data = {}) {
    const state = this.readState();
    this.appendEventInternal(state, forgeRunId, status, message, data);
    this.writeState(state);
  }

  setRunStatus(forgeRunId, status, patch = {}) {
    const state = this.readState();
    const row = state.runs.find((entry) => entry.forgeRunId === forgeRunId);
    if (!row) {
      return null;
    }

    row.status = status;
    row.txHash = patch.txHash || row.txHash || null;
    row.contractAddress = patch.contractAddress || row.contractAddress || null;
    row.deploymentId = patch.deploymentId || row.deploymentId || null;
    row.resultSnapshot = patch.resultSnapshot ? clone(patch.resultSnapshot) : row.resultSnapshot;
    row.errorMessage = patch.errorMessage || null;
    row.updatedAt = nowIso();
    row.finalizedAt = patch.finalized ? row.updatedAt : row.finalizedAt;

    this.appendEventInternal(state, forgeRunId, status, patch.message || `Run moved to ${status}.`, patch);
    this.writeState(state);
    return normalizeRunRecord(row);
  }

  saveDeployment(record) {
    const state = this.readState();
    const existing = state.deployments.findIndex((entry) => entry.deploymentId === record.deploymentId);
    const next = {
      deploymentId: record.deploymentId,
      contractName: record.contractName,
      contractAddress: record.contractAddress,
      chainId: record.chainId,
      txHash: record.txHash || null,
      registeredBy: record.registeredBy,
      createdAt: record.createdAt || nowIso(),
      metadata: clone(record.metadata || {})
    };

    if (existing >= 0) {
      state.deployments[existing] = next;
    } else {
      const conflict = state.deployments.find((entry) => entry.contractAddress === next.contractAddress);
      if (conflict) {
        conflict.deploymentId = next.deploymentId;
        conflict.contractName = next.contractName;
        conflict.chainId = next.chainId;
        conflict.txHash = next.txHash;
        conflict.registeredBy = next.registeredBy;
        conflict.createdAt = next.createdAt;
        conflict.metadata = next.metadata;
      } else {
        state.deployments.push(next);
      }
    }

    this.writeState(state);
  }

  getRun(forgeRunId) {
    const state = this.readState();
    return normalizeRunRecord(state.runs.find((entry) => entry.forgeRunId === forgeRunId));
  }

  findExistingRun(actorId, idempotencyKey, requestHash) {
    const state = this.readState();
    return normalizeRunRecord(
      state.runs.find(
        (entry) =>
          entry.actorId === actorId &&
          entry.idempotencyKey === idempotencyKey &&
          entry.requestHash === requestHash
      )
    );
  }

  listRunEvents(forgeRunId) {
    const state = this.readState();
    return state.runEvents
      .filter((entry) => entry.forgeRunId === forgeRunId)
      .sort((a, b) => a.id - b.id)
      .map(normalizeEventRecord);
  }

  listDeployments() {
    const state = this.readState();
    return state.deployments
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(normalizeDeploymentRecord);
  }

  getDeployment(deploymentId) {
    const state = this.readState();
    return normalizeDeploymentRecord(state.deployments.find((entry) => entry.deploymentId === deploymentId));
  }

  getLatestDeployment() {
    return this.listDeployments()[0] || null;
  }

  close() {}
}

class SqliteRunStore {
  constructor(DatabaseSync, filePath) {
    ensureParent(filePath);
    this.db = new DatabaseSync(filePath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS runs (
        forge_run_id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        run_type TEXT NOT NULL,
        status TEXT NOT NULL,
        signer_mode TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        rpc_profile TEXT NOT NULL,
        target_contract TEXT,
        allowed_action TEXT NOT NULL,
        tx_hash TEXT,
        contract_address TEXT,
        deployment_id TEXT,
        envelope_json TEXT NOT NULL,
        result_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        finalized_at TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_idempotency
      ON runs (actor_id, idempotency_key, request_hash);

      CREATE TABLE IF NOT EXISTS run_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        forge_run_id TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT NOT NULL,
        data_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS deployments (
        deployment_id TEXT PRIMARY KEY,
        contract_name TEXT NOT NULL,
        contract_address TEXT NOT NULL UNIQUE,
        chain_id INTEGER NOT NULL,
        tx_hash TEXT,
        registered_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL
      );
    `);

    this.insertRunStmt = this.db.prepare(`
      INSERT INTO runs (
        forge_run_id, idempotency_key, request_hash, actor_id, run_type, status, signer_mode, chain_id,
        rpc_profile, target_contract, allowed_action, tx_hash, contract_address, deployment_id,
        envelope_json, result_json, error_message, created_at, updated_at, finalized_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);
    this.updateRunStatusStmt = this.db.prepare(`
      UPDATE runs
      SET status = ?, tx_hash = COALESCE(?, tx_hash), contract_address = COALESCE(?, contract_address),
          deployment_id = COALESCE(?, deployment_id), result_json = COALESCE(?, result_json),
          error_message = ?, updated_at = ?, finalized_at = ?
      WHERE forge_run_id = ?
    `);
    this.insertEventStmt = this.db.prepare(`
      INSERT INTO run_events (forge_run_id, status, message, data_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    this.insertDeploymentStmt = this.db.prepare(`
      INSERT INTO deployments (deployment_id, contract_name, contract_address, chain_id, tx_hash, registered_by, created_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(deployment_id) DO UPDATE SET
        contract_name = excluded.contract_name,
        contract_address = excluded.contract_address,
        chain_id = excluded.chain_id,
        tx_hash = excluded.tx_hash,
        registered_by = excluded.registered_by,
        metadata_json = excluded.metadata_json
    `);
  }

  createRun(record) {
    const createdAt = nowIso();
    this.insertRunStmt.run(
      record.forgeRunId,
      record.idempotencyKey,
      record.requestHash,
      record.actorId,
      record.runType,
      record.status,
      record.signerMode,
      record.chainId,
      record.rpcProfile,
      record.targetContract || null,
      record.allowedAction,
      null,
      null,
      null,
      JSON.stringify(record.envelope || {}),
      null,
      null,
      createdAt,
      createdAt,
      null
    );
    this.appendEvent(record.forgeRunId, record.status, "Run accepted.", {
      runType: record.runType,
      allowedAction: record.allowedAction
    });
    return this.getRun(record.forgeRunId);
  }

  appendEvent(forgeRunId, status, message, data = {}) {
    this.insertEventStmt.run(forgeRunId, status, message, JSON.stringify(data), nowIso());
  }

  setRunStatus(forgeRunId, status, patch = {}) {
    const updatedAt = nowIso();
    const finalizedAt = patch.finalized ? updatedAt : null;
    this.updateRunStatusStmt.run(
      status,
      patch.txHash || null,
      patch.contractAddress || null,
      patch.deploymentId || null,
      patch.resultSnapshot ? JSON.stringify(patch.resultSnapshot) : null,
      patch.errorMessage || null,
      updatedAt,
      finalizedAt,
      forgeRunId
    );
    this.appendEvent(forgeRunId, status, patch.message || `Run moved to ${status}.`, patch);
    return this.getRun(forgeRunId);
  }

  saveDeployment(record) {
    this.insertDeploymentStmt.run(
      record.deploymentId,
      record.contractName,
      record.contractAddress,
      record.chainId,
      record.txHash || null,
      record.registeredBy,
      record.createdAt || nowIso(),
      JSON.stringify(record.metadata || {})
    );
  }

  getRun(forgeRunId) {
    const row = this.db.prepare("SELECT * FROM runs WHERE forge_run_id = ?").get(forgeRunId);
    if (!row) {
      return null;
    }
    return {
      forgeRunId: row.forge_run_id,
      idempotencyKey: row.idempotency_key,
      requestHash: row.request_hash,
      actorId: row.actor_id,
      runType: row.run_type,
      status: row.status,
      signerMode: row.signer_mode,
      chainId: row.chain_id,
      rpcProfile: row.rpc_profile,
      targetContract: row.target_contract,
      allowedAction: row.allowed_action,
      txHash: row.tx_hash,
      contractAddress: row.contract_address,
      deploymentId: row.deployment_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      finalizedAt: row.finalized_at,
      errorMessage: row.error_message,
      envelope: parseJson(row.envelope_json, {}),
      resultSnapshot: parseJson(row.result_json, null)
    };
  }

  findExistingRun(actorId, idempotencyKey, requestHash) {
    const row = this.db
      .prepare("SELECT * FROM runs WHERE actor_id = ? AND idempotency_key = ? AND request_hash = ?")
      .get(actorId, idempotencyKey, requestHash);
    return row ? this.getRun(row.forge_run_id) : null;
  }

  listRunEvents(forgeRunId) {
    return this.db
      .prepare("SELECT * FROM run_events WHERE forge_run_id = ? ORDER BY id ASC")
      .all(forgeRunId)
      .map((row) => ({
        id: row.id,
        forgeRunId: row.forge_run_id,
        status: row.status,
        message: row.message,
        data: parseJson(row.data_json, {}),
        createdAt: row.created_at
      }));
  }

  listDeployments() {
    return this.db
      .prepare("SELECT * FROM deployments ORDER BY created_at DESC")
      .all()
      .map((row) => ({
        deploymentId: row.deployment_id,
        contractName: row.contract_name,
        contractAddress: row.contract_address,
        chainId: row.chain_id,
        txHash: row.tx_hash,
        registeredBy: row.registered_by,
        createdAt: row.created_at,
        metadata: parseJson(row.metadata_json, {})
      }));
  }

  getDeployment(deploymentId) {
    const row = this.db.prepare("SELECT * FROM deployments WHERE deployment_id = ?").get(deploymentId);
    return row
      ? {
          deploymentId: row.deployment_id,
          contractName: row.contract_name,
          contractAddress: row.contract_address,
          chainId: row.chain_id,
          txHash: row.tx_hash,
          registeredBy: row.registered_by,
          createdAt: row.created_at,
          metadata: parseJson(row.metadata_json, {})
        }
      : null;
  }

  getLatestDeployment() {
    return this.listDeployments()[0] || null;
  }

  close() {
    this.db.close();
  }
}

function resolveStoreBackend() {
  try {
    const { DatabaseSync } = require("node:sqlite");
    return { type: "sqlite", DatabaseSync };
  } catch {
    return { type: "json-fallback", DatabaseSync: null };
  }
}

export class RunStore {
  constructor({ root, relativePath }) {
    const absolutePath = path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath);
    const backend = resolveStoreBackend();
    this.backendType = backend.type;
    this.impl =
      backend.type === "sqlite"
        ? new SqliteRunStore(backend.DatabaseSync, absolutePath)
        : new JsonFallbackRunStore(absolutePath);
  }

  createRun(record) {
    return this.impl.createRun(record);
  }

  appendEvent(forgeRunId, status, message, data = {}) {
    return this.impl.appendEvent(forgeRunId, status, message, data);
  }

  setRunStatus(forgeRunId, status, patch = {}) {
    return this.impl.setRunStatus(forgeRunId, status, patch);
  }

  saveDeployment(record) {
    return this.impl.saveDeployment(record);
  }

  getRun(forgeRunId) {
    return this.impl.getRun(forgeRunId);
  }

  findExistingRun(actorId, idempotencyKey, requestHash) {
    return this.impl.findExistingRun(actorId, idempotencyKey, requestHash);
  }

  listRunEvents(forgeRunId) {
    return this.impl.listRunEvents(forgeRunId);
  }

  listDeployments() {
    return this.impl.listDeployments();
  }

  getDeployment(deploymentId) {
    return this.impl.getDeployment(deploymentId);
  }

  getLatestDeployment() {
    return this.impl.getLatestDeployment();
  }

  close() {
    return this.impl.close();
  }
}
