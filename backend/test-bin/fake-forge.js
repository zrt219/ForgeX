const args = process.argv.slice(2);

function out(line) {
  process.stdout.write(`${line}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

if (args.includes("--version")) {
  out("forge 1.0.0-forgex-test");
  process.exit(0);
}

if (args[0] === "build") {
  await sleep(90);
  out("Compiling 2 files with Solc 0.8.24");
  await sleep(90);
  out("Solc 0.8.24 finished in 84.13ms");
  await sleep(90);
  out("Compiler run successful");
  process.exit(0);
}

if (args[0] === "script") {
  await sleep(100);
  out("Script started for XRPL EVM testnet");
  await sleep(100);
  out("Broadcasting deployment transaction");
  await sleep(110);
  out("Deployed to: 0x1234567890abcdef1234567890abcdef12345678");
  await sleep(110);
  out("Transaction hash: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  process.exit(0);
}

if (args[0] === "verify-contract") {
  await sleep(80);
  out("Verification submitted");
  await sleep(80);
  out("Verification successful");
  process.exit(0);
}

process.stderr.write(`Unsupported fake forge command: ${args.join(" ")}\n`);
process.exit(1);
