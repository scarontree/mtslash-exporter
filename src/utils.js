// ─── XML / 属性转义 ──────────────────────────────────────────────────────────

export function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function escapeAttribute(value) {
  return escapeXml(value).replace(/`/g, "&#96;");
}

// ─── DOM ─────────────────────────────────────────────────────────────────────

export function textOf(node) {
  return node ? (node.textContent || "").replace(/\s+/g, " ").trim() : "";
}

// ─── 文件名 ───────────────────────────────────────────────────────────────────

export function sanitizeFilename(input) {
  return String(input || "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

// ─── 异步工具 ─────────────────────────────────────────────────────────────────

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// ─── 正则工具 ─────────────────────────────────────────────────────────────────

export function normalizeRegexFlags(value) {
  const unique = Array.from(new Set(String(value || "").replace(/[^dgimsuvy]/g, "").split("")));
  return unique.join("");
}

export function buildCustomHeadingRegex(chapterMode, pattern, flags) {
  if (chapterMode !== "custom") {
    return null;
  }
  if (!pattern) {
    throw new Error("自定义正则模式需要填写分节正则");
  }
  try {
    return new RegExp(pattern, normalizeRegexFlags(flags));
  } catch (error) {
    throw new Error(`自定义分节正则无效：${error.message}`);
  }
}
