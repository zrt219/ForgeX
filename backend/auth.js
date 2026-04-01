import crypto from "node:crypto";

const LOOPBACK_SET = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function createAuthManager(config) {
  const sessionToken = crypto.randomBytes(24).toString("hex");

  function isLocalRequest(request) {
    const address = request.socket?.remoteAddress || request.ip || "";
    return LOOPBACK_SET.has(address);
  }

  function requireLocalRequest(request, response, next) {
    if (!config.requireLocalOnly || isLocalRequest(request)) {
      next();
      return;
    }

    response.status(403).json({
      ok: false,
      error: "ForgeX only accepts local requests in secure mode."
    });
  }

  function requireSession(request, response, next) {
    const headerToken = request.get(config.sessionHeader);
    const queryToken = request.query?.[config.sessionQueryKey];
    const presented = headerToken || queryToken;

    if (presented && presented === sessionToken) {
      request.forgexActor = {
        actorId: config.operatorId,
        role: "EXECUTOR"
      };
      next();
      return;
    }

    response.status(401).json({
      ok: false,
      error: "ForgeX operator session is required."
    });
  }

  return {
    sessionToken,
    issueSession() {
      return {
        actorId: config.operatorId,
        role: "EXECUTOR",
        sessionToken
      };
    },
    isLocalRequest,
    requireLocalRequest,
    requireSession
  };
}
