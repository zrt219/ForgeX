let cachedSession = null;

export async function ensureOperatorSession() {
  if (cachedSession) {
    return cachedSession;
  }

  const response = await fetch("/api/session", {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error("ForgeX could not start a local operator session. Open the app from the same local machine.");
  }

  cachedSession = await response.json();
  return cachedSession;
}

async function authHeaders(extra = {}) {
  const session = await ensureOperatorSession();
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-forgex-session": session.sessionToken,
    ...extra
  };
}

export async function readJson(url) {
  const response = await fetch(url, { headers: await authHeaders({ Accept: "application/json" }) });
  if (!response.ok) {
    throw new Error(`Request failed for ${url}`);
  }
  return response.json();
}

export async function writeJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url}`);
  }

  return response.json();
}

export async function streamNdjson(url, payload, onPacket) {
  const response = await fetch(url, {
    method: "POST",
    headers: await authHeaders({ Accept: "application/x-ndjson" }),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Streaming failed for ${url}`);
  }

  if (!response.body) {
    throw new Error("Streaming is not available in this browser.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      onPacket(JSON.parse(line));
    }
  }

  if (buffer.trim()) {
    onPacket(JSON.parse(buffer));
  }
}

export async function buildEventSourceUrl(url) {
  const session = await ensureOperatorSession();
  const target = new URL(url, window.location.origin);
  target.searchParams.set("sessionToken", session.sessionToken);
  return target.toString();
}
