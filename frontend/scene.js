import { DEFAULT_BACKGROUND_ID, UI_CONFIG, resolveBackgroundId } from "./config.js";

const BACKGROUND_MAP = new Map(UI_CONFIG.backgrounds.map((entry) => [entry.id, entry]));

export class SceneController {
  constructor({ root, overlay, overlayAddress, devMode, initialBackground = DEFAULT_BACKGROUND_ID }) {
    this.root = root;
    this.overlay = overlay;
    this.overlayAddress = overlayAddress;
    this.devMode = devMode;
    this.backgroundId = resolveBackgroundId(initialBackground);
  }

  async init() {
    this.root.classList.add("static-scene");
    this.setBackground(this.backgroundId);
  }

  setChainState() {}

  pulse() {}

  setBackground(backgroundId) {
    this.backgroundId = resolveBackgroundId(backgroundId);
    const background = BACKGROUND_MAP.get(this.backgroundId) || BACKGROUND_MAP.get(DEFAULT_BACKGROUND_ID);
    this.root.dataset.background = this.backgroundId;
    this.root.style.setProperty("--scene-image", `url("${background.asset}")`);
    this.root.style.setProperty("--scene-position", background.position || "center center");
    document.querySelector("#art-credit-name")?.replaceChildren(document.createTextNode(background.credit || background.artist));
  }

  getState() {
    return {
      backgroundId: this.backgroundId
    };
  }

  async triggerPermanence(address) {
    this.overlayAddress.textContent = address;
    this.overlay.hidden = false;
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
    this.overlay.hidden = true;
  }
}
