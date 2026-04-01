export function initializeNdjson(response) {
  response.status(200);
  response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders?.();
}

export function writePacket(response, type, data = {}) {
  response.write(`${JSON.stringify({ type, ...data })}\n`);
}

export function completeStream(response, ok, data = {}) {
  writePacket(response, "complete", { ok, ...data });
  response.end();
}

export function createPacketWriter(response) {
  return {
    log(stage, message, meta = {}) {
      writePacket(response, "log", { stage, message, ...meta });
    },
    data(stage, payload = {}) {
      writePacket(response, "data", { stage, ...payload });
    },
    error(stage, message, meta = {}) {
      writePacket(response, "error", { stage, message, ...meta });
    },
    complete(ok, payload = {}) {
      completeStream(response, ok, payload);
    }
  };
}
