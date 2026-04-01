import { buildEventSourceUrl, ensureOperatorSession, readJson, streamNdjson, writeJson } from "./state-client.js";
import { SceneController } from "./scene.js";
import { TerminalController } from "./terminal.js";
import { DEFAULT_BACKGROUND_ID, UI_CONFIG, resolveBackgroundId } from "./config.js";

const params = new URLSearchParams(window.location.search);
const devMode = params.get("dev") === "true";

const DEFAULT_STAGE_MESSAGES = {
  preflight: "Checking environment...",
  prepare: "Preparing...",
  deploy: "Deploying...",
  confirm: "Confirming...",
  finalize: "Finalizing..."
};

const ANIMATED_STAGE_MESSAGES = new Set(["Checking environment", "Preparing", "Deploying", "Confirming", "Finalizing"]);
const DEFAULT_UI_STATE = {
  terminal: { x: null, y: null, width: null, height: null, devMode },
  backgroundId: DEFAULT_BACKGROUND_ID,
  themeId: DEFAULT_BACKGROUND_ID
};

function stageLabel(packet) {
  if (packet.type !== "log") {
    return null;
  }

  if (packet.message?.includes("XRPL connection unstable")) {
    return "XRPL connection unstable... retrying";
  }

  return DEFAULT_STAGE_MESSAGES[packet.stage] || null;
}

function runtimeLabel(message) {
  return message.replace(/\.\.\.$/u, "");
}

function setTheme(themeId) {
  document.body.dataset.theme = themeId;
}

function renderSocialBar(container) {
  container.innerHTML = "";
  for (const social of UI_CONFIG.socials) {
    const link = document.createElement("a");
    link.className = "social-link";
    link.href = social.href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.title = social.label;
    link.dataset.tooltip = social.label;
    link.setAttribute("aria-label", social.label);

    const label = document.createElement("span");
    label.className = "social-link-label";
    label.textContent = social.short;
    link.appendChild(label);
    container.appendChild(link);
  }
}

function renderBackgroundControls(container, scene, getActiveId, setActiveId) {
  container.innerHTML = "";

  for (const background of UI_CONFIG.backgrounds) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost-button background-button";
    button.dataset.background = background.id;
    button.title = background.artist;
    button.setAttribute("aria-label", background.artist);

    const label = document.createElement("span");
    label.className = "background-button-label";
    label.textContent = background.label;
    button.appendChild(label);

    if (background.note) {
      const note = document.createElement("span");
      note.className = "background-button-note";
      note.textContent = background.note;
      button.appendChild(note);
    }

    button.addEventListener("click", () => {
      scene.setBackground(background.id);
      setActiveId(background.id);
      sync();
    });

    container.appendChild(button);
  }

  function sync() {
    const activeId = getActiveId();
    for (const button of container.querySelectorAll(".background-button")) {
      button.classList.toggle("active", button.dataset.background === activeId);
    }
  }

  sync();
  return sync;
}

function updateReadinessPill(element, ready, degraded = false) {
  element.classList.toggle("ready", ready);
  element.classList.toggle("degraded", degraded);
}

function createRuntimeUpdater(terminal) {
  const xrpPrice = document.querySelector("#xrp-price");
  const systemStatus = document.querySelector("#system-status");
  const rpcReady = document.querySelector("#rpc-ready");
  const artifactReady = document.querySelector("#artifact-ready");
  const simulationReady = document.querySelector("#simulation-ready");

  const state = {
    runtimeState: "ForgeX Ready",
    xrpPriceUsd: null,
    systemStatus: "on",
    readiness: {}
  };

  return (payload = {}) => {
    Object.assign(state, payload, {
      readiness: {
        ...state.readiness,
        ...(payload.readiness || {})
      }
    });
    const runtimeState = state.runtimeState || "ForgeX Ready";
    const readiness = state.readiness || {};

    if (typeof state.xrpPriceUsd === "number" && Number.isFinite(state.xrpPriceUsd)) {
      xrpPrice.textContent = `XRP $${state.xrpPriceUsd.toFixed(2)}`;
    } else {
      xrpPrice.textContent = "XRP unavailable";
    }

    systemStatus.textContent = state.systemStatus === "degraded" ? "System Degraded" : "System On";
    terminal.setRuntimeStatus(runtimeState);

    updateReadinessPill(rpcReady, readiness.networkReady === true, state.systemStatus === "degraded" && !readiness.networkReady);
    updateReadinessPill(artifactReady, readiness.buildFresh === true, readiness.artifactsReady === false);
    updateReadinessPill(simulationReady, readiness.simulationReady === true, false);
  };
}

async function connectRuntimeStream(updateRuntime) {
  const url = await buildEventSourceUrl("/events");
  const source = new EventSource(url);
  source.addEventListener("runtime.snapshot", (event) => {
    const packet = JSON.parse(event.data);
    updateRuntime(packet.payload);
  });
  source.onerror = () => {
    source.close();
    window.setTimeout(() => {
      void connectRuntimeStream(updateRuntime);
    }, 1600);
  };
}

async function bootstrap() {
  await ensureOperatorSession();

  const scene = new SceneController({
    root: document.querySelector("#scene-root"),
    overlay: document.querySelector("#permanence-overlay"),
    overlayAddress: document.querySelector("#permanence-address"),
    devMode,
    initialBackground: DEFAULT_UI_STATE.backgroundId
  });
  await scene.init();
  setTheme(DEFAULT_UI_STATE.themeId);

  const terminal = new TerminalController({
    root: document.querySelector("#terminal"),
    initialState: DEFAULT_UI_STATE,
    devMode,
    onCommand: async (command) => {
      const commandStartedAt = performance.now();
      let latestResult = null;
      const idempotencyKey = `cmd_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      terminal.beginRun(command);
      window.__forgexPerf = {
        ...(window.__forgexPerf || {}),
        lastCommand: {
          command,
          uiAckMs: Math.round(performance.now() - commandStartedAt)
        }
      };

      try {
        await streamNdjson("/ai", { text: command, idempotencyKey }, async (packet) => {
          if (packet.type === "log") {
            if (devMode) {
              terminal.append("system", `[${packet.stage}] ${packet.message}`);
            } else {
              const label = stageLabel(packet);
              if (label) {
                terminal.appendStage(label);
                terminal.setRuntimeStatus(runtimeLabel(label), {
                  animate: ANIMATED_STAGE_MESSAGES.has(runtimeLabel(label))
                });
              }
            }
          }

          if (devMode && packet.type === "data" && packet.stream && packet.chunk?.trim()) {
            terminal.append(packet.stream === "stderr" ? "error" : "system", packet.chunk.trim());
          }

          if (packet.type === "error") {
            terminal.append("error", packet.message);
          }

          if (packet.type === "data" && packet.stage === "result" && packet.result) {
            latestResult = packet.result;
          }

          if (packet.type === "complete") {
            const result = packet.result || latestResult;

            if (result) {
              if (packet.ok && result.contractAddress && result.finalOutput?.includes("is now permanent.")) {
                void scene.triggerPermanence(result.contractAddress);
              }

              terminal.renderResult(result);
              terminal.showLogs(devMode);
            }

            terminal.setRuntimeStatus("ForgeX Ready");
          }
        });
      } catch (caughtError) {
        terminal.append("error", "Streaming failed. Falling back to static ForgeX output...");

        try {
          const fallback = await writeJson("/api/command", { text: command, idempotencyKey });
          if (fallback.result) {
            terminal.renderResult(fallback.result);
          }
        } catch (fallbackError) {
          terminal.append("error", fallbackError instanceof Error ? fallbackError.message : String(fallbackError));
          terminal.append("system", "Fallback: run the same command in your local terminal with `npx forgex`.");
        }
        terminal.setRuntimeStatus("ForgeX Ready");
      } finally {
        terminal.focusInput();
      }
    }
  });

  renderSocialBar(document.querySelector("#top-social-bar"));

  let themeId = DEFAULT_UI_STATE.themeId;
  const syncBackgroundButtons = renderBackgroundControls(document.querySelector("#background-controls"), scene, () => themeId, (nextMode) => {
    themeId = nextMode;
    setTheme(nextMode);
  });

  const updateRuntime = createRuntimeUpdater(terminal);
  void connectRuntimeStream(updateRuntime);
  void readJson("/api/runtime-status").then(updateRuntime).catch(() => {});
  window.setInterval(() => {
    void readJson("/api/runtime-status").then(updateRuntime).catch(() => {});
  }, 15000);

  void readJson("/state/ui")
    .then((uiState) => {
      const resolvedTheme = resolveBackgroundId(uiState.themeId || uiState.backgroundId || DEFAULT_BACKGROUND_ID);
      themeId = resolvedTheme;
      setTheme(resolvedTheme);
      scene.setBackground(resolveBackgroundId(uiState.backgroundId || resolvedTheme));
      terminal.hydrateState(uiState);
      syncBackgroundButtons();
    })
    .catch(() => {});

  window.setInterval(() => {
    void writeJson("/state/ui", {
      ...terminal.getState(devMode),
      ...scene.getState(),
      themeId,
      updatedAt: new Date().toISOString()
    }).catch(() => {});
  }, 1500);
}

bootstrap().catch((caughtError) => {
  const log = document.querySelector("#terminal-log");
  const entry = document.createElement("div");
  entry.className = "log-entry error";
  entry.textContent = caughtError instanceof Error ? caughtError.message : String(caughtError);
  log?.appendChild(entry);
});
