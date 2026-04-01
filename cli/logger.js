export function logLine(message = "") {
  process.stdout.write(`${message}\n`);
}

export function info(message) {
  process.stdout.write(`[ForgeX] ${message}\n`);
}

export function error(message) {
  process.stderr.write(`[ForgeX] Error: ${message}\n`);
}

export function section(title) {
  process.stdout.write(`\n[ForgeX] ${title}\n`);
}
