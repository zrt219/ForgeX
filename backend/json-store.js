import fs from "node:fs";
import path from "node:path";

function ensureDirectory(targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
}

export function ensureJsonFile(targetPath, seedValue) {
  ensureDirectory(targetPath);

  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, JSON.stringify(seedValue, null, 2));
    return structuredClone(seedValue);
  }

  return readJson(targetPath, seedValue);
}

export function readJson(targetPath, fallbackValue) {
  try {
    const raw = fs.readFileSync(targetPath, "utf8");
    return JSON.parse(raw);
  } catch (_error) {
    if (fallbackValue === undefined) {
      throw _error;
    }

    writeJson(targetPath, fallbackValue);
    return structuredClone(fallbackValue);
  }
}

export function writeJson(targetPath, value) {
  ensureDirectory(targetPath);

  const tempPath = `${targetPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2));
  fs.renameSync(tempPath, targetPath);
}
