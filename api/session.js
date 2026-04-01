function sendJson(res, statusCode, payload) {
  res.status(statusCode);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.end(JSON.stringify(payload));
}

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  return sendJson(res, 200, {
    sessionToken: `vercel-preview-${Date.now()}`,
    preview: true,
    mode: "vercel-preview",
    runtimeMode: "preview",
    signerMode: "unavailable",
    readOnly: true,
    localOnly: false,
    message: "Vercel preview mode. ForgeX local runtime is unavailable here."
  });
}
