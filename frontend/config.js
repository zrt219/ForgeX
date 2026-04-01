const buildJapanAsset = (fileName) => `/japan/${encodeURIComponent(fileName)}`;

export const UI_CONFIG = {
  socials: [
    { id: "github", label: "GitHub", short: "GH", href: "https://github.com/zrt219" },
    { id: "x", label: "X", short: "X", href: "https://x.com/ZRT_219" },
    { id: "kick", label: "Kick", short: "K", href: "https://kick.com/zrt-219" },
    { id: "youtube", label: "YouTube", short: "YT", href: "https://www.youtube.com/@ZRT_219" },
    { id: "instagram", label: "Instagram", short: "IG", href: "https://www.instagram.com/zrthoops" },
    { id: "beacons", label: "Beacons", short: "B", href: "https://beacons.ai/zrt_219" }
  ],
  backgrounds: [
    {
      id: "hokusai-1",
      artist: "Katsushika Hokusai",
      label: "Hokusai",
      note: "Katsushika I",
      credit: "Katsushika Hokusai",
      asset: buildJapanAsset("ChatGPT Image Mar 24, 2026, 01_27_37 AM.png"),
      position: "center center"
    },
    {
      id: "kunisada",
      artist: "Utagawa Kunisada",
      label: "Kunisada",
      note: "Utagawa",
      credit: "Utagawa Kunisada",
      asset: buildJapanAsset("ChatGPT Image Mar 24, 2026, 01_27_48 AM.png"),
      position: "center center"
    },
    {
      id: "utamaro",
      artist: "Kitagawa Utamaro",
      label: "Utamaro",
      note: "Kitagawa",
      credit: "Kitagawa Utamaro",
      asset: buildJapanAsset("ChatGPT Image Mar 24, 2026, 01_32_57 AM.png"),
      position: "center center"
    },
    {
      id: "hokusai-2",
      artist: "Katsushika Hokusai",
      label: "Hokusai",
      note: "Katsushika II",
      credit: "Katsushika Hokusai",
      asset: buildJapanAsset("ChatGPT Image Mar 24, 2026, 12_49_11 AM.png"),
      position: "center center"
    }
  ]
};

export const BACKGROUND_IDS = new Set(UI_CONFIG.backgrounds.map((entry) => entry.id));
export const DEFAULT_BACKGROUND_ID = UI_CONFIG.backgrounds[0].id;

export function resolveBackgroundId(candidate) {
  return BACKGROUND_IDS.has(candidate) ? candidate : DEFAULT_BACKGROUND_ID;
}
