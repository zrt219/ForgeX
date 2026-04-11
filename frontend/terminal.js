const MARGIN = 16;
const HANDOFF_DELAY_MS = 300;
const MIN_WIDTH = 560;
const MIN_HEIGHT = 430;

const NEXT_ACTION_COMMANDS = {
  "Main menu": { kind: "command", input: "main menu" },
  "Get value": { kind: "command", input: "get value" },
  "Set value": { kind: "prompt-command", inputPrefix: "set value ", prompt: "Enter value" },
  "Deploy again": { kind: "command", input: "deploy contract" },
  "Show history": { kind: "command", input: "show history" }
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function button(label, handler, className = "action-button", disabled = false) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  element.disabled = disabled;
  element.addEventListener("click", handler);
  return element;
}

async function copyToClipboard(value) {
  if (!value) {
    throw new Error("Nothing to copy.");
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Copy failed.");
  }
}

export class TerminalController {
  constructor({ root, onCommand, initialState, devMode, lockedLayout = false }) {
    this.root = root;
    this.header = document.querySelector("#terminal-header");
    this.log = document.querySelector("#terminal-log");
    this.form = document.querySelector("#command-form");
    this.input = document.querySelector("#command-input");
    this.runtimeStatus = document.querySelector("#runtime-status");
    this.resultPanel = document.querySelector("#result-panel");
    this.jumpLatestButton = document.querySelector("#jump-latest");
    this.toggleLogsButton = document.querySelector("#toggle-logs");
    this.resizeHandle = document.querySelector("#terminal-resize");
    this.devMode = devMode;
    this.lockedLayout = lockedLayout;
    this.onCommand = onCommand;
    this.size = {
      width: initialState?.terminal?.width ?? root.offsetWidth,
      height: initialState?.terminal?.height ?? root.offsetHeight
    };
    this.position = {
      x: initialState?.terminal?.x ?? root.offsetLeft,
      y: initialState?.terminal?.y ?? root.offsetTop
    };
    this.targetPosition = { ...this.position };
    this.drag = null;
    this.resize = null;
    this.raf = null;
    this.logsCollapsed = false;
    this.autoScroll = true;
    this.stageMessages = new Set();
    this.statusAnimation = null;
    this.revealTimer = null;

    this.root.classList.toggle("locked-layout", this.lockedLayout);
    this.attachEvents();
    this.applySize(this.size.width, this.size.height);
    this.applyPosition(this.position.x, this.position.y);
    this.append("system", "Running ForgeX...");
    this.append("system", "Try: deploy contract");
    this.setRuntimeStatus("ForgeX Ready");
    window.setTimeout(() => this.focusInput(), 0);
  }

  renderPreviewHero() {
    this.clearResult();
    this.resultPanel.hidden = false;
    this.resultPanel.classList.add("preview-hero");

    const hero = document.createElement("section");
    hero.className = "preview-hero-card";

    const heading = document.createElement("div");
    heading.className = "result-heading";
    heading.textContent = "ForgeX terminal";
    hero.appendChild(heading);

    const title = document.createElement("div");
    title.className = "preview-hero-title";
    title.textContent = "Deploy a contract, set a message, and preview the execution handoff.";
    hero.appendChild(title);

    const copy = document.createElement("div");
    copy.className = "preview-hero-copy";
    copy.textContent =
      "This deployment is a read-only presentation layer. Use the command dock below to step through the ForgeX flow without local signer access.";
    hero.appendChild(copy);

    const actions = document.createElement("div");
    actions.className = "action-row compact";
    for (const label of ["deploy contract", "get value", "set value hello"]) {
      actions.appendChild(
        button(label, () => {
          this.input.value = label;
          this.focusInput();
        }, "action-button secondary")
      );
    }
    hero.appendChild(actions);

    this.resultPanel.appendChild(hero);
  }

  attachEvents() {
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = this.input.value.trim();
      if (!value) {
        return;
      }
      this.input.value = "";
      void this.runTextCommand(value);
    });

    if (!this.lockedLayout) {
      this.header.addEventListener("pointerdown", (event) => {
        if (event.target instanceof HTMLElement && event.target.closest("button, a")) {
          return;
        }
        if (event.button !== 0) {
          return;
        }
        this.drag = {
          startX: event.clientX,
          startY: event.clientY,
          originX: this.position.x,
          originY: this.position.y
        };
        this.root.classList.add("dragging");
        this.header.setPointerCapture(event.pointerId);
      });

      this.header.addEventListener("pointermove", (event) => {
        if (!this.drag) {
          return;
        }
        const nextX = this.drag.originX + (event.clientX - this.drag.startX);
        const nextY = this.drag.originY + (event.clientY - this.drag.startY);
        this.targetPosition = this.clampPosition(nextX, nextY);
        this.schedulePosition();
      });

      this.resizeHandle?.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }
        this.resize = {
          startX: event.clientX,
          startY: event.clientY,
          originWidth: this.size.width,
          originHeight: this.size.height
        };
        this.resizeHandle.setPointerCapture(event.pointerId);
        event.preventDefault();
      });

      this.resizeHandle?.addEventListener("pointermove", (event) => {
        if (!this.resize) {
          return;
        }
        const width = this.resize.originWidth + (event.clientX - this.resize.startX);
        const height = this.resize.originHeight + (event.clientY - this.resize.startY);
        this.applySize(width, height);
        this.applyPosition(this.position.x, this.position.y);
      });

      const stopDrag = () => {
        this.drag = null;
        this.root.classList.remove("dragging");
      };

      const stopResize = () => {
        this.resize = null;
      };

      this.header.addEventListener("pointerup", stopDrag);
      this.header.addEventListener("pointercancel", stopDrag);
      this.resizeHandle?.addEventListener("pointerup", stopResize);
      this.resizeHandle?.addEventListener("pointercancel", stopResize);
    }

    window.addEventListener("resize", () => {
      this.applySize(this.size.width, this.size.height);
      const next = this.clampPosition(this.position.x, this.position.y);
      this.applyPosition(next.x, next.y);
    });

    this.jumpLatestButton.addEventListener("click", () => {
      this.autoScroll = true;
      this.scrollToLatest();
    });

    this.toggleLogsButton.addEventListener("click", () => {
      this.showLogs(this.logsCollapsed);
    });

    this.log.addEventListener("scroll", () => {
      const nearBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 32;
      this.autoScroll = nearBottom;
      this.jumpLatestButton.hidden = nearBottom;
    });
  }

  async runTextCommand(value) {
    this.beginRun(value);
    await this.onCommand(value);
  }

  beginRun(command) {
    this.showLogs(true);
    this.clearResult();
    this.stageMessages.clear();
    this.append("command", `> ${command}`);
    this.appendStage("Running ForgeX...");
    this.appendStage("Checking environment...");
    this.setRuntimeStatus("Running ForgeX...");
    this.focusInput();
  }

  async executeNextAction(label) {
    const action = NEXT_ACTION_COMMANDS[label];
    if (!action) {
      return;
    }

    if (action.kind === "command") {
      await this.runTextCommand(action.input);
      return;
    }

    if (action.kind === "prompt-command") {
      const value = window.prompt(action.prompt || "Enter value");
      if (value === null) {
        return;
      }

      const trimmed = value.trim();
      if (!trimmed) {
        this.showNotice("Value required.");
        return;
      }

      await this.runTextCommand(`${action.inputPrefix}${trimmed}`);
    }
  }

  async openLink(url) {
    if (!url) {
      return;
    }

    window.open(url, "_blank", "noreferrer");
  }

  async copyValue(value) {
    try {
      await copyToClipboard(value);
      this.showNotice("Copied.");
    } catch {
      this.showNotice("Press Ctrl+C to copy.");
    }
  }

  focusInput() {
    this.input.focus({ preventScroll: true });
  }

  clearStatusAnimation() {
    if (this.statusAnimation) {
      window.clearInterval(this.statusAnimation.id);
      this.statusAnimation = null;
    }
  }

  setRuntimeStatus(message, { animate = false } = {}) {
    this.clearStatusAnimation();

    if (!animate) {
      this.runtimeStatus.textContent = message;
      return;
    }

    const base = message.replace(/\.*$/u, "");
    let step = 0;
    const frames = [".", "..", "..."];
    this.runtimeStatus.textContent = `${base}${frames[0]}`;
    this.statusAnimation = {
      id: window.setInterval(() => {
        step = (step + 1) % frames.length;
        this.runtimeStatus.textContent = `${base}${frames[step]}`;
      }, 260)
    };
  }

  appendStage(message) {
    if (!message || this.stageMessages.has(message)) {
      return;
    }

    this.stageMessages.add(message);
    this.append("system", message);
  }

  clampPosition(x, y) {
    const maxX = window.innerWidth - this.size.width - MARGIN;
    const maxY = window.innerHeight - this.size.height - MARGIN;
    return {
      x: clamp(x, MARGIN, Math.max(MARGIN, maxX)),
      y: clamp(y, MARGIN, Math.max(MARGIN, maxY))
    };
  }

  clampSize(width, height) {
    const maxWidth = Math.max(360, window.innerWidth - MARGIN * 2);
    const maxHeight = Math.max(320, window.innerHeight - MARGIN * 2);
    const minWidth = Math.min(MIN_WIDTH, maxWidth);
    const minHeight = Math.min(MIN_HEIGHT, maxHeight);
    return {
      width: clamp(width, minWidth, maxWidth),
      height: clamp(height, minHeight, maxHeight)
    };
  }

  schedulePosition() {
    if (this.raf) {
      return;
    }

    this.raf = window.requestAnimationFrame(() => {
      this.raf = null;
      this.applyPosition(this.targetPosition.x, this.targetPosition.y);
    });
  }

  applyPosition(x, y) {
    if (this.lockedLayout) {
      this.position = { x: 0, y: 0 };
      this.root.style.left = "0";
      this.root.style.top = "0";
      return;
    }
    this.position = this.clampPosition(x, y);
    this.root.style.left = `${this.position.x}px`;
    this.root.style.top = `${this.position.y}px`;
  }

  applySize(width, height) {
    if (this.lockedLayout) {
      this.size = {
        width: window.innerWidth,
        height: window.innerHeight
      };
      this.root.style.width = "100vw";
      this.root.style.height = "100vh";
      return;
    }
    this.size = this.clampSize(width, height);
    this.root.style.width = `${this.size.width}px`;
    this.root.style.height = `${this.size.height}px`;
  }

  hydrateState(state = {}) {
    const terminal = state.terminal || {};
    if (terminal.width || terminal.height) {
      this.applySize(terminal.width ?? this.size.width, terminal.height ?? this.size.height);
    }
    if (terminal.x !== undefined || terminal.y !== undefined) {
      this.applyPosition(terminal.x ?? this.position.x, terminal.y ?? this.position.y);
    }
  }

  getState(devMode) {
    return {
      terminal: {
        x: this.position.x,
        y: this.position.y,
        width: this.size.width,
        height: this.size.height,
        devMode
      }
    };
  }

  append(kind, message) {
    if (!message) {
      return;
    }

    const entry = document.createElement("div");
    entry.className = `log-entry ${kind}`;
    entry.textContent = message;
    this.log.appendChild(entry);
    if (this.autoScroll) {
      this.scrollToLatest();
    } else {
      this.jumpLatestButton.hidden = false;
    }
  }

  scrollToLatest() {
    this.log.scrollTop = this.log.scrollHeight;
    this.jumpLatestButton.hidden = true;
  }

  showLogs(visible) {
    this.logsCollapsed = !visible;
    this.root.classList.toggle("logs-collapsed", !visible);
    this.toggleLogsButton.textContent = visible ? "Hide logs" : "View logs";
  }

  clearResult() {
    if (this.revealTimer) {
      window.clearTimeout(this.revealTimer);
      this.revealTimer = null;
    }

    this.resultPanel.hidden = true;
    this.resultPanel.innerHTML = "";
    this.resultPanel.classList.remove("preview-hero");
  }

  showNotice(message) {
    const notice = document.createElement("div");
    notice.className = "result-notice";
    notice.textContent = message;
    this.resultPanel.prepend(notice);
    window.setTimeout(() => notice.remove(), 2200);
  }

  renderShareRow(result) {
    const commandPreview = result.command || result.metadata?.commandPreview || "";
    const canCopyCommand = Boolean(result.actions?.canCopyCommand && commandPreview);

    if (!result.shareText && !result.contractAddress && !canCopyCommand) {
      return null;
    }

    const row = document.createElement("div");
    row.className = "action-row";

    if (canCopyCommand) {
      row.appendChild(button("Copy deploy command", () => void this.copyValue(commandPreview), "action-button primary"));
    }

    if (result.shareText) {
      row.appendChild(button("Copy Share Text", () => void this.copyValue(result.shareText), "action-button primary"));
    }

    if (result.contractAddress && (result.actions?.canCopyAddress ?? true)) {
      row.appendChild(button("Copy address", () => void this.copyValue(result.contractAddress), "action-button secondary"));
    }

    return row;
  }

  renderHandoff(result) {
    if (result.status !== "confirmed") {
      return null;
    }

    const hasAddress = Boolean(result.contractAddress && result.explorer?.addressUrl);
    const hasTransaction = Boolean(result.transactionHash && result.explorer?.txUrl);
    const hasChainDestination = hasAddress || hasTransaction;

    if (!hasChainDestination) {
      return null;
    }

    const section = document.createElement("section");
    section.className = "handoff-layer handoff-hidden";

    const title = document.createElement("div");
    title.className = "result-heading";
    title.textContent = "Continue on-chain";
    section.appendChild(title);

    const text = document.createElement("div");
    text.className = "handoff-text";
    text.textContent = result.mode === "simulation" ? "Explorer unavailable. Try again later." : "Your contract is now live on XRPL.";
    section.appendChild(text);

    const row = document.createElement("div");
    row.className = "action-row handoff-actions";

    const explorerDisabled = result.mode === "simulation";
    const transactionDisabled = explorerDisabled || !result.actions?.canViewTransaction || !hasTransaction;
    const addressDisabled = explorerDisabled || !result.actions?.canOpenContract || !hasAddress;
    const readWriteDisabled = explorerDisabled || !result.actions?.canOpenReadWrite || !hasAddress;
    const copyAddressDisabled = explorerDisabled || !result.actions?.canCopyAddress || !hasAddress;
    const copyTransactionDisabled = explorerDisabled || !result.actions?.canCopyTransaction || !hasTransaction;

    row.appendChild(
      button(
        "View transaction",
        () => void this.openLink(result.explorer?.txUrl),
        "action-button secondary",
        transactionDisabled
      )
    );
    row.appendChild(
      button(
        "Open contract",
        () => void this.openLink(result.explorer?.addressUrl),
        "action-button secondary",
        addressDisabled
      )
    );
    row.appendChild(
      button(
        "Open read/write",
        () => void this.openLink(result.explorer?.addressUrl),
        "action-button secondary",
        readWriteDisabled
      )
    );
    row.appendChild(
      button(
        "Copy address",
        () => void this.copyValue(result.contractAddress),
        "action-button secondary",
        copyAddressDisabled
      )
    );
    row.appendChild(
      button(
        "Copy transaction",
        () => void this.copyValue(result.transactionHash),
        "action-button secondary",
        copyTransactionDisabled
      )
    );

    section.appendChild(row);
    return section;
  }

  renderPreparedActions(result) {
    const commandPreview = result.command || result.metadata?.commandPreview || "";
    if (result.status !== "prepared" || !commandPreview || !result.forgeRunId) {
      return null;
    }

    const section = document.createElement("section");
    section.className = "next-actions handoff-hidden";

    const heading = document.createElement("div");
    heading.className = "result-heading";
    heading.textContent = "Finalize deployment";
    section.appendChild(heading);

    if (result.nextStep) {
      const text = document.createElement("div");
      text.className = "handoff-text";
      text.textContent = result.nextStep;
      section.appendChild(text);
    }

    const row = document.createElement("div");
    row.className = "action-row";

    row.appendChild(
      button("Paste tx hash", async () => {
        const txHash = window.prompt("Paste transaction hash");
        if (txHash === null) {
          return;
        }
        const trimmed = txHash.trim();
        if (!trimmed) {
          this.showNotice("Transaction hash required.");
          return;
        }
        await this.runTextCommand(`finalize deploy ${result.forgeRunId} ${trimmed}`);
      })
    );

    if (result.actions?.canImportBroadcast) {
      row.appendChild(
        button("Import Foundry broadcast", async () => {
          const artifactPath = window.prompt("Broadcast path (leave blank for run-latest.json)", "");
          if (artifactPath === null) {
            return;
          }
          const trimmed = artifactPath.trim();
          await this.runTextCommand(
            trimmed ? `import broadcast ${result.forgeRunId} ${trimmed}` : `import broadcast ${result.forgeRunId}`
          );
        }, "action-button secondary")
      );
    }

    section.appendChild(row);
    return section;
  }

  renderNextActions(result) {
    const labels = Array.isArray(result.nextActions) ? result.nextActions.filter((label) => NEXT_ACTION_COMMANDS[label]) : [];
    const withMenu = /ForgeX Main Menu/u.test(result.finalOutput || "") ? labels : ["Main menu", ...labels];
    const uniqueLabels = withMenu.filter((label, index) => NEXT_ACTION_COMMANDS[label] && withMenu.indexOf(label) === index);
    if (!uniqueLabels.length) {
      return null;
    }

    const container = document.createElement("section");
    container.className = "next-actions handoff-hidden";

    const heading = document.createElement("div");
    heading.className = "result-heading";
    heading.textContent = "What next?";
    container.appendChild(heading);

    const row = document.createElement("div");
    row.className = "action-row";
    for (const label of uniqueLabels) {
      row.appendChild(button(label, () => void this.executeNextAction(label), "action-button"));
    }
    container.appendChild(row);

    return container;
  }

  renderResult(result) {
    this.clearResult();
    this.resultPanel.hidden = false;

    const block = document.createElement("pre");
    block.className = "result-block";
    block.textContent = result.finalOutput || result.error || "";
    this.resultPanel.appendChild(block);

    if (result.status === "confirmed" && result.contractAddress) {
      const trust = document.createElement("div");
      trust.className = "trust-line";
      trust.textContent = "Recorded on XRPL";
      this.resultPanel.appendChild(trust);
    }

    const shareRow = this.renderShareRow(result);
    if (shareRow) {
      this.resultPanel.appendChild(shareRow);
    }

    const delayedStack = document.createElement("div");
    delayedStack.className = "delayed-stack";

    const preparedActions = this.renderPreparedActions(result);
    const handoff = this.renderHandoff(result);
    const nextActions = this.renderNextActions(result);

    if (preparedActions) {
      delayedStack.appendChild(preparedActions);
    }

    if (handoff) {
      delayedStack.appendChild(handoff);
    }

    if (nextActions) {
      delayedStack.appendChild(nextActions);
    }

    if (delayedStack.childNodes.length > 0) {
      this.resultPanel.appendChild(delayedStack);
      this.revealTimer = window.setTimeout(() => {
        for (const child of delayedStack.children) {
          child.classList.remove("handoff-hidden");
        }
      }, HANDOFF_DELAY_MS);
    }
  }
}
