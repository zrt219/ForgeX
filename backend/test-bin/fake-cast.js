import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const statePath = path.join(os.tmpdir(), "forgex-fake-cast-state.json");

function out(line) {
  process.stdout.write(`${line}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return { message: "ForgeX online on XRPL EVM" };
  }
}

function writeState(nextState) {
  fs.writeFileSync(statePath, JSON.stringify(nextState, null, 2), "utf8");
}

if (args.includes("--version")) {
  out("cast 1.0.0-forgex-test");
  process.exit(0);
}

if (args[0] === "call") {
  await sleep(90);
  const signature = args[2] || "";
  const state = readState();

  if (signature === "message()(string)" || signature === "getMessage()(string)") {
    out(state.message);
    process.exit(0);
  }

  out("ForgeX terminal uplink established");
  process.exit(0);
}

if (args[0] === "send") {
  const signature = args[2] || "";
  const rpcIndex = args.indexOf("--rpc-url");
  const messageArgIndex = rpcIndex > -1 ? 3 : -1;

  if ((signature === "setMessage(string)" || signature === "setMessage(string,bytes32)") && messageArgIndex > -1) {
    const nextValue = args[messageArgIndex] || "";
    writeState({ message: nextValue });
  }

  await sleep(90);
  out("blockHash            0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  await sleep(90);
  out("transactionHash      0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc");
  await sleep(90);
  out("status               1 (success)");
  process.exit(0);
}

if (args[0] === "balance") {
  await sleep(80);
  out("1000000000000000000");
  process.exit(0);
}

if (args[0] === "tx") {
  await sleep(80);
  out("status               1 (success)");
  await sleep(80);
  out("gasUsed              21000");
  process.exit(0);
}

process.stderr.write(`Unsupported fake cast command: ${args.join(" ")}\n`);
process.exit(1);
