import { STORAGE_KEY, defaults } from "./constants.js";
import { normalizeRegexFlags } from "./utils.js";

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...defaults };
    }
    const parsed = JSON.parse(raw);
    return {
      chapterMode: parsed.chapterMode || defaults.chapterMode,
      customHeadingPattern: parsed.customHeadingPattern || defaults.customHeadingPattern,
      customHeadingFlags: normalizeRegexFlags(parsed.customHeadingFlags || defaults.customHeadingFlags),
    };
  } catch (_error) {
    return { ...defaults };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      chapterMode: settings.chapterMode || defaults.chapterMode,
      customHeadingPattern: settings.customHeadingPattern || "",
      customHeadingFlags: normalizeRegexFlags(settings.customHeadingFlags || ""),
    }));
  } catch (_error) {
    // ignore storage errors
  }
}
