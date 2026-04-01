import { spawn } from "node:child_process";

function normalizeArgs(args = []) {
  return Array.isArray(args) ? args.map((entry) => String(entry)) : [];
}

export function runExecStream({
  command,
  args = [],
  cwd,
  env,
  writer,
  label,
  meta = {}
}) {
  return new Promise((resolve) => {
    const child = spawn(command, normalizeArgs(args), {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let firstOutputMarked = false;

    const markFirstOutput = () => {
      if (firstOutputMarked) {
        return;
      }
      firstOutputMarked = true;
      writer?.log?.(label, "first execution output", { ...meta, firstOutput: true });
    };

    child.stdout?.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      markFirstOutput();
      writer?.data?.(label, { stream: "stdout", chunk: text });
    });

    child.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      markFirstOutput();
      writer?.data?.(label, { stream: "stderr", chunk: text });
    });

    child.on("error", (error) => {
      writer?.error?.(label, error.message, meta);
      resolve({ ok: false, stdout, stderr, code: 1, signal: null, error });
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        writer?.log?.(label, `${label} completed`, { ...meta, code });
      } else {
        writer?.error?.(label, `${label} exited with code ${code ?? "unknown"}`, {
          ...meta,
          code,
          signal
        });
      }

      resolve({ ok: code === 0, stdout, stderr, code, signal, error: null });
    });
  });
}
