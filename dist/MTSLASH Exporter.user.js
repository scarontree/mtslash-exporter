// ==UserScript==
// @name         MTSLASH Exporter
// @namespace    https://www.mtslash.life/
// @version      1.0.3
// @description  Export fanfics to TXT/EPUB from mtslash thread pages.
// @author       qom
// @match        *://www.mtslash.life/forum.php?mod=viewthread*
// @match        *://www.mtslash.life/thread-*-*-*.html*
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==
(() => {
  // src/constants.js
  var APP_ID = "mtslash-exporter";
  var STYLE_ID = `${APP_ID}-style`;
  var PANEL_ID = `${APP_ID}-panel`;
  var LAUNCHER_ID = `${APP_ID}-launcher`;
  var STORAGE_KEY = `${APP_ID}-settings`;
  var LOG_LIMIT = 120;
  var state = {
    running: false,
    cancelled: false,
    logs: []
  };
  var defaults = {
    authorMode: "lz",
    format: "epub",
    chapterMode: "simple",
    customHeadingPattern: "",
    customHeadingFlags: ""
  };

  // src/utils.js
  function escapeXml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  function escapeAttribute(value) {
    return escapeXml(value).replace(/`/g, "&#96;");
  }
  function textOf(node) {
    return node ? (node.textContent || "").replace(/\s+/g, " ").trim() : "";
  }
  function sanitizeFilename(input) {
    return String(input || "").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120);
  }
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
  function normalizeRegexFlags(value) {
    const unique = Array.from(new Set(String(value || "").replace(/[^dgimsuvy]/g, "").split("")));
    return unique.join("");
  }
  function buildCustomHeadingRegex(chapterMode, pattern, flags) {
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

  // src/settings.js
  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { ...defaults };
      }
      const parsed = JSON.parse(raw);
      return {
        chapterMode: parsed.chapterMode || defaults.chapterMode,
        customHeadingPattern: parsed.customHeadingPattern || defaults.customHeadingPattern,
        customHeadingFlags: normalizeRegexFlags(parsed.customHeadingFlags || defaults.customHeadingFlags)
      };
    } catch (_error) {
      return { ...defaults };
    }
  }
  function saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        chapterMode: settings.chapterMode || defaults.chapterMode,
        customHeadingPattern: settings.customHeadingPattern || "",
        customHeadingFlags: normalizeRegexFlags(settings.customHeadingFlags || "")
      }));
    } catch (_error) {
    }
  }

  // src/ui.js
  function gearSvg() {
    return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.1 7.1 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.58.22-1.13.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54c.58-.22 1.13-.53 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"/>
  </svg>`;
  }
  function closeSvg() {
    return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
    <path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M6 6 18 18M18 6 6 18"/>
  </svg>`;
  }
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
    #${PANEL_ID} {
      --mts-panel-bg: linear-gradient(180deg, rgba(255, 251, 245, 0.98) 0%, rgba(246, 249, 252, 0.98) 100%);
      --mts-border: rgba(145, 170, 193, 0.4);
      --mts-text: #24364a;
      --mts-subtle: #6a7d92;
      --mts-accent: #1f5f95;
      --mts-accent-strong: #174f7f;
      --mts-accent-soft: #e8f1fa;
      --mts-surface: rgba(255, 255, 255, 0.9);
      box-sizing: border-box;
      position: fixed;
      top: 18px;
      right: 18px;
      z-index: 2147483647;
      width: 380px;
      max-width: calc(100vw - 36px);
      max-height: calc(100vh - 36px);
      overflow: auto;
      padding: 18px;
      border: 1px solid var(--mts-border);
      border-radius: 18px;
      box-shadow: 0 24px 60px rgba(27, 50, 75, 0.18);
      background: var(--mts-panel-bg);
      backdrop-filter: blur(18px);
      color: var(--mts-text);
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    #${PANEL_ID}::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      background:
        radial-gradient(circle at top right, rgba(255, 255, 255, 0.72), transparent 34%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.28), transparent 26%);
    }
    #${PANEL_ID}[hidden], #${LAUNCHER_ID}[hidden] { display: none !important; }
    #${PANEL_ID} .${APP_ID}__header {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    #${PANEL_ID} .${APP_ID}__header strong {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    #${PANEL_ID} .${APP_ID}__close-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 1px solid rgba(123, 149, 173, 0.24);
      background: rgba(255, 255, 255, 0.58);
      color: #46627d;
      cursor: pointer;
      border-radius: 999px;
      touch-action: manipulation;
    }
    #${PANEL_ID} .${APP_ID}__close-button:active { background: rgba(232, 241, 250, 0.9); }
    #${PANEL_ID} .${APP_ID}__close-button svg { display: block; width: 18px; height: 18px; }
    #${PANEL_ID} .${APP_ID}__row {
      position: relative;
      display: grid;
      grid-template-columns: 64px 1fr;
      gap: 12px;
      align-items: center;
      margin-bottom: 12px;
    }
    #${PANEL_ID} .${APP_ID}__row[hidden] { display: none; }
    #${PANEL_ID} .${APP_ID}__row > label {
      color: var(--mts-subtle);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    #${PANEL_ID} select,
    #${PANEL_ID} input,
    #${PANEL_ID} button,
    #${PANEL_ID} textarea {
      font: inherit;
      font-size: 14px;
      border-radius: 12px;
      box-sizing: border-box;
    }
    #${PANEL_ID} select,
    #${PANEL_ID} input {
      min-height: 44px;
      height: 44px;
      padding: 10px 14px;
      border: 1px solid rgba(160, 184, 205, 0.56);
      background: var(--mts-surface);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
      line-height: normal;
      appearance: none;
      -webkit-appearance: none;
      color: var(--mts-text);
    }
    #${PANEL_ID} select:focus,
    #${PANEL_ID} input:focus,
    #${PANEL_ID} textarea:focus {
      outline: none;
      border-color: rgba(31, 95, 149, 0.65);
      box-shadow: 0 0 0 3px rgba(31, 95, 149, 0.12);
    }
    #${PANEL_ID} input::placeholder { color: #8c9caf; }
    #${PANEL_ID} select {
      background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2337546f' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      padding-right: 38px;
    }
    #${PANEL_ID} .${APP_ID}__actions {
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 18px;
    }
    #${PANEL_ID} .${APP_ID}__settings {
      margin: 4px 0 12px;
      padding: 14px;
      border: 1px solid rgba(175, 196, 214, 0.48);
      background: rgba(255, 255, 255, 0.58);
      border-radius: 16px;
    }
    #${PANEL_ID} .${APP_ID}__field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 10px;
    }
    #${PANEL_ID} .${APP_ID}__field > label {
      color: var(--mts-subtle);
      font-size: 12px;
      font-weight: 700;
    }
    #${PANEL_ID} .${APP_ID}__field:last-child { margin-bottom: 0; }
    #${PANEL_ID} .${APP_ID}__hint {
      margin: 0;
      color: var(--mts-subtle);
      font-size: 12px;
      line-height: 1.4;
    }
    #${PANEL_ID} .${APP_ID}__button {
      min-height: 46px;
      height: 46px;
      border: 1px solid transparent;
      cursor: pointer;
      font-weight: 700;
      letter-spacing: -0.01em;
      touch-action: manipulation;
      transition: transform 140ms ease, background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
    }
    #${PANEL_ID} .${APP_ID}__button--primary {
      background: var(--mts-accent);
      color: #fff;
      box-shadow: 0 4px 12px rgba(31, 95, 149, 0.15);
    }
    #${PANEL_ID} .${APP_ID}__button--secondary {
      border-color: rgba(160, 184, 205, 0.64);
      background: rgba(255, 255, 255, 0.7);
      color: var(--mts-subtle);
    }
    #${PANEL_ID} .${APP_ID}__button:active { transform: translateY(1px); }
    #${PANEL_ID} button:disabled,
    #${PANEL_ID} input:disabled { opacity: 0.55; cursor: not-allowed; }
    #${PANEL_ID} .${APP_ID}__meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin: 14px 0 8px;
    }
    #${PANEL_ID} .${APP_ID}__status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--mts-subtle);
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
    }
    #${PANEL_ID} .${APP_ID}__status::before {
      content: "";
      display: block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: #8c9caf;
      transition: background-color 0.2s, box-shadow 0.2s;
    }
    #${PANEL_ID} .${APP_ID}__status[data-running="true"]::before {
      background-color: #10b981;
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
    }
    #${PANEL_ID} .${APP_ID}__log-label {
      color: var(--mts-subtle);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    #${PANEL_ID} .${APP_ID}__log {
      width: 100%;
      max-width: 100%;
      min-height: 132px;
      resize: vertical;
      padding: 12px 14px;
      border: 1px solid rgba(175, 196, 214, 0.52);
      background: rgba(250, 252, 255, 0.82);
      color: #334;
      box-sizing: border-box;
      overflow-wrap: anywhere;
      border-radius: 14px;
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 12px;
      line-height: 1.55;
    }
    #${LAUNCHER_ID} {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      width: 52px;
      height: 52px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: linear-gradient(180deg, #ffffff 0%, #e8f1fa 100%);
      color: var(--mts-accent-strong);
      box-shadow: 0 12px 28px rgba(33, 52, 74, 0.18);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      user-select: none;
      touch-action: none;
    }
    #${LAUNCHER_ID} svg { display: block; width: 24px; height: 24px; }
    #${LAUNCHER_ID}:active { cursor: grabbing; background: #dceaf4; }

    @media screen and (max-device-width: 800px), screen and (max-width: 600px) {
      #${PANEL_ID} {
        top: auto !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        width: 100%;
        max-width: 100%;
        max-height: min(88vh, 760px);
        border: none;
        border-top: 1px solid rgba(145, 170, 193, 0.32);
        border-radius: 24px 24px 0 0;
        padding: 18px 18px calc(20px + env(safe-area-inset-bottom));
        box-shadow: 0 -16px 44px rgba(33, 52, 74, 0.14);
      }
      #${PANEL_ID} .${APP_ID}__header { margin-bottom: 16px; }
      #${PANEL_ID} .${APP_ID}__header strong { font-size: 15px; }
      #${PANEL_ID} select,
      #${PANEL_ID} input { font-size: 16px; min-height: 50px; height: 50px; }
      #${PANEL_ID} .${APP_ID}__button { font-size: 16px; min-height: 52px; height: 52px; }
      #${PANEL_ID} .${APP_ID}__close-button { width: 40px; height: 40px; }
      #${PANEL_ID} .${APP_ID}__row {
        grid-template-columns: 1fr;
        gap: 8px;
        margin-bottom: 14px;
        align-items: stretch;
      }
      #${PANEL_ID} .${APP_ID}__row > label { padding-left: 2px; }
      #${PANEL_ID} .${APP_ID}__actions { grid-template-columns: 1fr 1fr; margin-top: 18px; }
      #${PANEL_ID} .${APP_ID}__meta { margin: 14px 0 8px; }
      #${PANEL_ID} .${APP_ID}__log { min-height: 112px; }
      #${LAUNCHER_ID} {
        bottom: calc(24px + env(safe-area-inset-bottom));
        right: 16px;
        width: 56px;
        height: 56px;
      }
      #${LAUNCHER_ID} svg { width: 28px; height: 28px; }
    }
  `;
    document.head.appendChild(style);
  }
  function setRunning(panel, running) {
    state.running = running;
    panel.querySelector('[data-role="export"]').disabled = running;
    panel.querySelector('[data-role="cancel"]').disabled = !running;
    const statusNode = panel.querySelector('[data-role="status"]');
    if (statusNode) {
      if (running) {
        statusNode.setAttribute("data-running", "true");
      } else {
        statusNode.removeAttribute("data-running");
      }
    }
  }
  function setStatus(panel, text) {
    const node = panel.querySelector('[data-role="status"]');
    if (node) node.textContent = text;
  }
  function log(message) {
    const timestamp = (/* @__PURE__ */ new Date()).toLocaleTimeString("zh-CN", { hour12: false });
    state.logs.push(`[${timestamp}] ${message}`);
    if (state.logs.length > LOG_LIMIT) state.logs.shift();
    const logNode = document.querySelector(`#${PANEL_ID} [data-role="log"]`);
    if (logNode) {
      logNode.value = state.logs.join("\n");
      logNode.scrollTop = logNode.scrollHeight;
    }
  }
  function setPanelVisibility(panel, launcher, visible) {
    if (panel) panel.hidden = !visible;
    if (launcher) launcher.hidden = visible;
  }
  function buildPanel(onExport) {
    const settings = loadSettings();
    const panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.innerHTML = `
    <div class="${APP_ID}__header">
      <strong>MTSLASH Exporter</strong>
      <button class="${APP_ID}__close-button" type="button" data-role="closePanel" aria-label="关闭面板">
        ${closeSvg()}
      </button>
    </div>
    <div class="${APP_ID}__row">
      <label>范围</label>
      <select data-role="authorMode">
        <option value="all">全部楼层</option>
        <option value="lz">仅楼主</option>
        <option value="uid">指定 UID</option>
      </select>
    </div>
    <div class="${APP_ID}__row" data-role="uidRow" hidden>
      <label>UID</label>
      <input data-role="uid" type="text" placeholder="输入目标用户 UID" />
    </div>
    <div class="${APP_ID}__row">
      <label>格式</label>
      <select data-role="format">
        <option value="txt">TXT</option>
        <option value="epub">EPUB</option>
      </select>
    </div>
    <div class="${APP_ID}__row">
      <label>章节</label>
      <select data-role="chapterMode">
        <option value="simple">Chapter N</option>
        <option value="custom">自定义正则</option>
      </select>
    </div>
    <div class="${APP_ID}__settings" data-role="settingsPanel">
      <div class="${APP_ID}__field">
        <label for="${APP_ID}-custom-pattern">分节正则</label>
        <input id="${APP_ID}-custom-pattern" data-role="customHeadingPattern" type="text" placeholder="例如 ^(?:第[0-9一二三四五六七八九十]+章|番外)$" value="${escapeAttribute(settings.customHeadingPattern)}" />
      </div>
      <div class="${APP_ID}__field">
        <label for="${APP_ID}-custom-flags">Flags</label>
        <input id="${APP_ID}-custom-flags" data-role="customHeadingFlags" type="text" placeholder="例如 i" value="${escapeAttribute(settings.customHeadingFlags)}" />
      </div>
      <p class="${APP_ID}__hint">选择"自定义正则"时，按逐行匹配章节标题处理。</p>
    </div>
    <div class="${APP_ID}__row ${APP_ID}__actions">
      <button class="${APP_ID}__button ${APP_ID}__button--primary" data-role="export">导出</button>
      <button class="${APP_ID}__button ${APP_ID}__button--secondary" data-role="cancel" disabled>取消</button>
    </div>
    <div class="${APP_ID}__meta">
      <div class="${APP_ID}__log-label">运行日志</div>
      <div class="${APP_ID}__status" data-role="status">空闲</div>
    </div>
    <textarea class="${APP_ID}__log" data-role="log" readonly></textarea>
  `;
    const authorMode = panel.querySelector('[data-role="authorMode"]');
    const uidInput = panel.querySelector('[data-role="uid"]');
    const exportBtn = panel.querySelector('[data-role="export"]');
    const cancelBtn = panel.querySelector('[data-role="cancel"]');
    const closeBtn = panel.querySelector('[data-role="closePanel"]');
    const chapterMode = panel.querySelector('[data-role="chapterMode"]');
    const settingsPanel = panel.querySelector('[data-role="settingsPanel"]');
    const patternInput = panel.querySelector('[data-role="customHeadingPattern"]');
    const flagsInput = panel.querySelector('[data-role="customHeadingFlags"]');
    const uidRow = panel.querySelector('[data-role="uidRow"]');
    authorMode.value = defaults.authorMode;
    panel.querySelector('[data-role="format"]').value = defaults.format;
    chapterMode.value = settings.chapterMode || defaults.chapterMode;
    uidRow.hidden = authorMode.value !== "uid";
    authorMode.addEventListener("change", () => {
      uidRow.hidden = authorMode.value !== "uid";
      if (authorMode.value !== "uid") uidInput.value = "";
    });
    chapterMode.addEventListener("change", () => {
      syncSettingsPanelState();
      persistPanelSettings();
    });
    patternInput.addEventListener("change", persistPanelSettings);
    flagsInput.addEventListener("change", persistPanelSettings);
    function syncSettingsPanelState() {
      settingsPanel.hidden = chapterMode.value !== "custom";
    }
    function persistPanelSettings() {
      const normalizedFlags = normalizeRegexFlags(flagsInput.value);
      flagsInput.value = normalizedFlags;
      saveSettings({
        chapterMode: chapterMode.value,
        customHeadingPattern: patternInput.value.trim(),
        customHeadingFlags: normalizedFlags
      });
    }
    syncSettingsPanelState();
    closeBtn.addEventListener("click", () => {
      const launcher = document.getElementById(LAUNCHER_ID);
      setPanelVisibility(panel, launcher, false);
    });
    exportBtn.addEventListener("click", async () => {
      if (state.running) return;
      try {
        await onExport(panel);
      } catch (error) {
        setStatus(panel, `失败：${error.message}`);
        log(`失败：${error.stack || error.message}`);
      } finally {
        setRunning(panel, false);
      }
    });
    cancelBtn.addEventListener("click", () => {
      state.cancelled = true;
      log("已请求取消，当前页结束后停止。");
      setStatus(panel, "正在取消...");
    });
    return panel;
  }
  function buildLauncher(panel) {
    const launcher = document.createElement("button");
    launcher.id = LAUNCHER_ID;
    launcher.type = "button";
    launcher.innerHTML = gearSvg();
    launcher.setAttribute("aria-label", "打开导出面板");
    enableLauncherDragging(launcher, panel);
    launcher.addEventListener("click", () => {
      if (launcher.dataset.dragged === "true") {
        launcher.dataset.dragged = "false";
        return;
      }
      setPanelVisibility(panel, launcher, true);
    });
    return launcher;
  }
  function enableLauncherDragging(launcher, panel) {
    let dragState = null;
    launcher.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const rect = launcher.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        moved: false
      };
      launcher.dataset.dragged = "false";
      launcher.setPointerCapture(event.pointerId);
    });
    launcher.addEventListener("pointermove", (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      if (!dragState.moved && Math.hypot(deltaX, deltaY) < 15) return;
      dragState.moved = true;
      launcher.dataset.dragged = "true";
      const left = clamp(event.clientX - dragState.offsetX, 8, window.innerWidth - launcher.offsetWidth - 8);
      const top = clamp(event.clientY - dragState.offsetY, 8, window.innerHeight - launcher.offsetHeight - 8);
      launcher.style.left = `${left}px`;
      launcher.style.top = `${top}px`;
      launcher.style.right = "auto";
      launcher.style.bottom = "auto";
    });
    launcher.addEventListener("pointerup", (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      launcher.releasePointerCapture(event.pointerId);
      const wasDragged = dragState.moved;
      dragState = null;
      launcher.dataset.dragged = "false";
      if (!wasDragged) setPanelVisibility(panel, launcher, true);
    });
    launcher.addEventListener("pointercancel", (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      launcher.releasePointerCapture(event.pointerId);
      dragState = null;
      launcher.dataset.dragged = "false";
    });
    launcher.addEventListener("click", (event) => {
      event.preventDefault();
    });
  }

  // src/scraper.js
  var FETCH = {
    maxRetries: 3,
    retryBaseMs: 1500,
    retryMaxMs: 8e3,
    retryJitterMin: 500,
    retryJitterMax: 1500,
    dsignDelayMin: 300,
    dsignDelayMax: 800
  };
  var AUTHOR_LINK_SELECTORS = [
    ".pls .authi a.xw1",
    '.pls a[href*="space-uid-"]',
    '.authi a[href*="space-uid-"]',
    '.authi a[href*="uid="]',
    'a[href*="space-uid-"]',
    'a[href*="mod=space&uid="]'
  ].join(",");
  function collectPostNodes(doc) {
    const explicitNodes = Array.from(
      doc.querySelectorAll('div[id^="post_"], li[id^="post_"], div[id^="pid"], li[id^="pid"]')
    );
    const fallbackNodes = Array.from(doc.querySelectorAll(".message, .postmessage")).map((node) => node.closest("li[id], div[id], table[id], article[id]") || node);
    const unique = /* @__PURE__ */ new Map();
    [...explicitNodes, ...fallbackNodes].forEach((node) => {
      if (!node || unique.has(node)) return;
      if (findMessageNode(node)) unique.set(node, true);
    });
    return Array.from(unique.keys());
  }
  function findMessageNode(postNode) {
    return postNode.querySelector([
      '[id^="postmessage_"]',
      ".message",
      ".postmessage",
      ".pcb .t_f"
    ].join(","));
  }
  function findAuthorLink(postNode) {
    return postNode.querySelector(AUTHOR_LINK_SELECTORS);
  }
  function extractAuthorName(postNode) {
    const fromLink = textOf(findAuthorLink(postNode));
    if (fromLink) return fromLink;
    const fromMeta = textOf(postNode.querySelector(".user_info .name, .userinfo .name"));
    return fromMeta || "未知作者";
  }
  function extractAuthorProfileUrl(postNode) {
    const link = findAuthorLink(postNode);
    return link ? new URL(link.getAttribute("href"), location.origin).toString() : void 0;
  }
  function uidFromProfileUrl(href) {
    if (!href) return void 0;
    const match = href.match(/(?:uid=|space-uid-)(\d+)/);
    return match ? match[1] : void 0;
  }
  function extractUidFromPost(postNode) {
    return uidFromProfileUrl(extractAuthorProfileUrl(postNode));
  }
  function extractFloor(postNode) {
    const floorLink = postNode.querySelector(".plc .pi strong a") || postNode.querySelector('.plc .pi a[href*="findpost"]') || Array.from(postNode.querySelectorAll(".plc .pi a, .authi a, a")).find((node) => /#/.test(node.textContent || ""));
    const floorText = textOf(floorLink) || textOf(postNode.querySelector(".plc .pi")) || textOf(postNode.querySelector(".authi")) || textOf(postNode);
    const match = floorText.match(/(\d+)\s*#|第\s*(\d+)\s*楼/);
    return match ? parseInt(match[1] || match[2], 10) : void 0;
  }
  function extractPublishedAt(postNode) {
    const candidates = [
      textOf(postNode.querySelector(".plc .pi .authi")),
      textOf(postNode.querySelector(".authi")),
      textOf(postNode.querySelector(".user_info")),
      textOf(postNode.querySelector(".userinfo")),
      textOf(postNode)
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const postTimeMatch = candidate.match(/发表于\s*([^\n|]+)/);
      if (postTimeMatch) return postTimeMatch[1].trim();
      const genericMatch = candidate.match(/(\d{4}-\d{1,2}-\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)/);
      if (genericMatch) return genericMatch[1].trim();
    }
    return void 0;
  }
  function looksLikeBlockedPage(html) {
    return [
      "尚未登录",
      "没有权限",
      "页面重载开启",
      "页面正在重新载入",
      "提示信息",
      "请输入验证码",
      "操作太频繁",
      "您的访问受限",
      "指定的主题不存在",
      "抱歉，您没有权限"
    ].some((needle) => html.includes(needle));
  }
  function isSupportedThreadPage(_doc, url) {
    const parsed = new URL(url, location.origin);
    return parsed.pathname.includes("thread-") || parsed.searchParams.get("mod") === "viewthread";
  }
  function extractThreadTitle(doc) {
    const candidates = [
      "#thread_subject",
      "h1.ts",
      ".thread_subject",
      ".thread-title",
      ".thread_tit",
      ".view_tit",
      ".tit",
      ".message h2 strong",
      "h1",
      "h2"
    ];
    for (const selector of candidates) {
      const el = doc.querySelector(selector);
      if (!el) continue;
      const title = cleanTitleElement(el);
      if (title && !/^(提示信息|用户登录)$/.test(title)) return title;
    }
    const pageTitle = textOf(doc.querySelector("title")).replace(/\s*-\s*随缘居.*$/, "").trim();
    return /^(提示信息|用户登录)$/.test(pageTitle) ? "" : pageTitle;
  }
  function cleanTitleElement(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('a[href*="authorid"], a[href*="only"]').forEach((link) => link.remove());
    let text = (clone.textContent || "").trim();
    text = text.replace(/\s*(只看楼主|只看该作者|电梯直达|显示全部楼层|倒序浏览|阅读模式)\s*/g, "");
    text = text.replace(/\s{2,}/g, " ").trim();
    return text;
  }
  function tidFromUrl(url) {
    if (!(url instanceof URL)) return null;
    return url.searchParams.get("tid") || (url.pathname.match(/thread-(\d+)-/) || [])[1] || null;
  }
  function extractTid(url, doc) {
    const fromUrl = tidFromUrl(url);
    if (fromUrl) return fromUrl;
    const copyLink = doc.querySelector('a[href*="thread-"]');
    const href = copyLink ? copyLink.getAttribute("href") || "" : "";
    const fromDom = (href.match(/thread-(\d+)-/) || [])[1];
    if (fromDom) return fromDom;
    throw new Error("无法解析 tid");
  }
  function pageFromPath(pathname) {
    return (pathname.match(/thread-\d+-(\d+)-/) || [])[1] || null;
  }
  function isSameThreadPage(targetUrl, currentUrl) {
    if (!(targetUrl instanceof URL) || !(currentUrl instanceof URL)) return false;
    const currentTid = tidFromUrl(currentUrl);
    const targetTid = tidFromUrl(targetUrl);
    if (currentTid && targetTid) return currentTid === targetTid;
    return targetUrl.pathname === currentUrl.pathname;
  }
  function parsePageValue(urlLike) {
    if (!(urlLike instanceof URL)) return void 0;
    const value = urlLike.searchParams.get("page") || pageFromPath(urlLike.pathname) || "1";
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? void 0 : parsed;
  }
  function findThreadPager(doc, currentUrl) {
    const pagers = Array.from(doc.querySelectorAll(".pg, .page"));
    if (!pagers.length) return null;
    let bestPager = null;
    let bestScore = -1;
    pagers.forEach((pager) => {
      let score = 0;
      pager.querySelectorAll("a, strong, em").forEach((node) => {
        const text = (node.textContent || "").trim();
        if (/^\d+$/.test(text)) score += 1;
        if (!(node instanceof HTMLAnchorElement)) return;
        try {
          const target = new URL(node.getAttribute("href"), currentUrl);
          if (isSameThreadPage(target, currentUrl)) score += 3;
        } catch (_error) {
        }
      });
      if (pager.querySelector('label input[type="text"]')) score += 2;
      const mobilePageSelect = pager.querySelector('select#dumppage, select[name="page"]');
      if (mobilePageSelect) {
        score += 4;
        score += mobilePageSelect.querySelectorAll("option").length;
      }
      if (score > bestScore) {
        bestScore = score;
        bestPager = pager;
      }
    });
    return bestScore > 0 ? bestPager : pagers[0];
  }
  function parsePageData(doc, currentUrl) {
    const pager = findThreadPager(doc, currentUrl);
    const pagerValues = /* @__PURE__ */ new Set();
    const currentPageFromUrl = parsePageValue(currentUrl) || 1;
    const mobilePageSelect = pager ? pager.querySelector('select#dumppage, select[name="page"]') : null;
    if (pager) {
      pager.querySelectorAll("a, strong, em").forEach((node) => {
        const value = parseInt((node.textContent || "").trim(), 10);
        if (!Number.isNaN(value)) pagerValues.add(value);
        if (!(node instanceof HTMLAnchorElement)) return;
        try {
          const target = new URL(node.getAttribute("href"), currentUrl);
          if (!isSameThreadPage(target, currentUrl)) return;
          const pageValue = parsePageValue(target);
          if (pageValue) pagerValues.add(pageValue);
        } catch (_error) {
        }
      });
    }
    if (mobilePageSelect) {
      Array.from(mobilePageSelect.options).forEach((option) => {
        const value = parseInt(option.value || option.textContent || "", 10);
        if (!Number.isNaN(value)) pagerValues.add(value);
      });
    }
    const pageInput = pager ? pager.querySelector('label input[type="text"]') : null;
    const mobileCurrentOption = mobilePageSelect ? mobilePageSelect.options[mobilePageSelect.selectedIndex] : null;
    const currentPage = pageInput ? parseInt(pageInput.value, 10) || currentPageFromUrl : mobileCurrentOption ? parseInt(mobileCurrentOption.value || mobileCurrentOption.textContent || "", 10) || currentPageFromUrl : currentPageFromUrl;
    let pageCount = Math.max(...Array.from(pagerValues), currentPage, 1);
    const pageLabel = pager ? pager.querySelector("label") : null;
    const match = pageLabel ? pageLabel.textContent.match(/\/\s*(\d+)\s*页/) : null;
    if (match) {
      pageCount = parseInt(match[1], 10);
    } else if (mobilePageSelect && mobilePageSelect.options.length) {
      pageCount = Math.max(
        ...Array.from(mobilePageSelect.options).map((option) => parseInt(option.value || option.textContent || "", 10) || 0),
        currentPage,
        1
      );
    }
    return { currentPage, pageCount, canonicalBase: currentUrl.toString() };
  }
  function buildPageUrl(context, page) {
    const currentUrl = new URL(context.currentUrl || location.href, location.origin);
    if (currentUrl.pathname.includes("thread-")) {
      currentUrl.pathname = `/thread-${context.tid}-${page}-1.html`;
      currentUrl.search = "";
      return currentUrl.toString();
    }
    currentUrl.searchParams.set("mod", "viewthread");
    currentUrl.searchParams.set("tid", context.tid);
    currentUrl.searchParams.set("page", String(page));
    return currentUrl.toString();
  }
  function buildCanonicalThreadUrl(tid) {
    return `${location.origin}/thread-${tid}-1-1.html`;
  }
  function createPageTargets(context) {
    const targets = [];
    for (let page = 1; page <= context.pageCount; page += 1) {
      targets.push({ page, url: buildPageUrl(context, page) });
    }
    return targets;
  }
  function normalizeCharset(charset) {
    const value = String(charset || "").trim().toLowerCase();
    if (value === "gb2312" || value === "gbk" || value === "gb18030") return "gbk";
    return value || "utf-8";
  }
  function detectCharset(response) {
    const contentType = response.headers.get("content-type") || "";
    const headerMatch = contentType.match(/charset=([^;]+)/i);
    if (headerMatch) return normalizeCharset(headerMatch[1]);
    if (location.hostname === "www.mtslash.life") return "gbk";
    return "utf-8";
  }
  function decodeHtml(buffer, response) {
    const charset = detectCharset(response);
    try {
      return new TextDecoder(charset).decode(buffer);
    } catch (_error) {
      return new TextDecoder("utf-8").decode(buffer);
    }
  }
  function extractDsignChallengeUrl(html, originalUrl) {
    if (html.length > 5e3) return null;
    if (!html.includes("location") || !html.includes("replace")) return null;
    if (html.includes("postmessage_") || html.includes("thread_subject")) return null;
    try {
      const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      if (!scriptMatch) return null;
      const scriptCode = scriptMatch[1];
      let locationUrl = null;
      let windowUrl = null;
      const locationProxy = new Proxy({}, {
        set(_target, _prop, value) {
          if (typeof value === "string" && value.includes("thread-")) locationUrl = value;
          return true;
        },
        get(_target, prop) {
          if (prop === "replace" || prop === "assign") return (url) => {
            locationUrl = url;
          };
          if (prop === "href") return "";
          return void 0;
        }
      });
      const windowProxy = new Proxy({}, {
        set(_target, _prop, value) {
          if (typeof value === "string" && value.includes("thread-")) windowUrl = value;
          return true;
        },
        get(_target, prop) {
          if (prop === "href") return "";
          return void 0;
        }
      });
      const fn = new Function("location", "window", scriptCode);
      fn(locationProxy, windowProxy);
      const candidates = [locationUrl, windowUrl].filter(Boolean);
      const bestUrl = candidates.find((v) => v.includes("_dsign") || v.includes("dsign")) || candidates[0];
      if (bestUrl) return new URL(bestUrl, originalUrl).toString();
    } catch (_error) {
    }
    const dsignMatch = html.match(/_dsign['"]?\s*[=+]\s*['"]([a-f0-9]+)/i) || html.match(/dsign=([a-f0-9]{6,})/i);
    if (dsignMatch) {
      try {
        const base = new URL(originalUrl);
        base.searchParams.set("_dsign", dsignMatch[1]);
        return base.toString();
      } catch (_error) {
      }
    }
    return null;
  }
  async function fetchThreadPage(url) {
    let currentUrl = url;
    for (let attempt = 1; attempt <= FETCH.maxRetries; attempt += 1) {
      try {
        log(`请求第 ${attempt} 次：${currentUrl}`);
        const response = await fetch(currentUrl, { credentials: "include", method: "GET" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        const html = decodeHtml(buffer, response);
        const challengeUrl = extractDsignChallengeUrl(html, currentUrl);
        if (challengeUrl) {
          log(`检测到 _dsign 安全验证，重定向至: ${challengeUrl}`);
          currentUrl = challengeUrl;
          await delay(randomInt(FETCH.dsignDelayMin, FETCH.dsignDelayMax));
          continue;
        }
        if (looksLikeBlockedPage(html)) throw new Error("命中登录/权限/重载提示页");
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        if (!isSupportedThreadPage(doc, url)) throw new Error("返回内容不是有效线程页");
        return doc;
      } catch (error) {
        if (attempt >= FETCH.maxRetries) throw error;
        const backoff = Math.min(FETCH.retryBaseMs * Math.pow(2, attempt - 1), FETCH.retryMaxMs);
        await delay(backoff + randomInt(FETCH.retryJitterMin, FETCH.retryJitterMax));
      }
    }
    throw new Error("抓取失败");
  }
  function extractThreadContext(doc, url) {
    const normalizedUrl = new URL(url, location.origin);
    const title = extractThreadTitle(doc);
    if (!title) throw new Error("未找到帖子标题，当前页面可能不是可访问的线程页");
    const pageData = parsePageData(doc, normalizedUrl);
    const tid = extractTid(normalizedUrl, doc);
    const posts = collectPostNodes(doc);
    if (!posts.length) throw new Error("未找到帖子楼层，页面可能是权限页或异常页");
    let lzUid = null;
    let lzName = null;
    const tathHeader = doc.querySelector("#tath");
    if (tathHeader) {
      const tathLinks = tathHeader.querySelectorAll('a[href*="space-uid-"], a[href*="mod=space"]');
      for (const lzLink of tathLinks) {
        const href = lzLink.getAttribute("href") || "";
        const uidMatch = href.match(/uid[-=](\d+)/);
        const name = textOf(lzLink) || lzLink.getAttribute("title") || "";
        if (uidMatch) {
          lzUid = uidMatch[1];
          if (name) lzName = name;
        }
      }
    }
    if (!lzUid) {
      const allAuthoridLinks = doc.querySelectorAll('a[href*="authorid"]');
      for (const link of allAuthoridLinks) {
        if ((link.textContent || "").trim() === "只看楼主") {
          const uidMatch = (link.getAttribute("href") || "").match(/authorid[=](\d+)/);
          if (uidMatch) {
            lzUid = uidMatch[1];
          }
          break;
        }
      }
    }
    if (!lzUid) {
      lzUid = extractUidFromPost(posts[0]);
      lzName = extractAuthorName(posts[0]);
    }
    if (lzUid && !lzName) {
      for (const postNode of posts) {
        if (extractUidFromPost(postNode) === lzUid) {
          lzName = extractAuthorName(postNode);
          break;
        }
      }
    }
    const uiNoiseNames = ["只看楼主", "只看该作者", "收藏", "回复", "举报", "未知作者"];
    if (lzName && uiNoiseNames.includes(lzName)) lzName = null;
    return {
      title,
      tid,
      pageCount: pageData.pageCount,
      currentPage: pageData.currentPage,
      canonicalBase: pageData.canonicalBase,
      canonicalUrl: buildCanonicalThreadUrl(tid),
      currentUrl: normalizedUrl.toString(),
      lzUid,
      lzName
    };
  }

  // src/frontmatter.js
  var KNOWN_FIELD_ORDER = ["标题", "原作", "作者", "译者", "分级", "警告", "配对", "标签", "摘要", "注释", "原文地址"];
  var FRONT_MATTER_ALIASES = {
    cp: "配对",
    CP: "配对",
    配對: "配对",
    tag: "标签",
    tags: "标签",
    Tags: "标签",
    summary: "摘要",
    Summary: "摘要",
    简介: "摘要",
    notes: "注释",
    Notes: "注释",
    备注: "注释",
    note: "注释",
    原文链接: "原文地址",
    原文: "原文地址",
    链接: "原文地址",
    link: "原文地址",
    Link: "原文地址",
    分类: "分类",
    类型: "分类"
  };
  function orderFrontMatter(result) {
    const ordered = {};
    KNOWN_FIELD_ORDER.forEach((key) => {
      if (key in result) ordered[key] = result[key];
    });
    Object.keys(result).forEach((key) => {
      if (!(key in ordered)) ordered[key] = result[key];
    });
    return ordered;
  }
  function normalizeFrontMatter(frontMatter, context) {
    const source = frontMatter || {};
    const normalized = orderFrontMatter(
      Object.fromEntries(Object.entries(source).filter(([, value]) => value))
    );
    if (!normalized["标题"]) normalized["标题"] = context.title;
    if (!normalized["作者"] && context.lzName) normalized["作者"] = context.lzName;
    return normalized;
  }
  function resolveMainAuthor({ authorMode, normalizedFrontMatter, context, posts, targetUid }) {
    var _a, _b;
    if (authorMode === "lz") {
      return normalizedFrontMatter["作者"] || context.lzName;
    }
    if (authorMode === "uid") {
      const name = ((_a = posts[0]) == null ? void 0 : _a.authorName) || "";
      return `${name}${targetUid ? ` (${targetUid})` : ""}`;
    }
    return normalizedFrontMatter["作者"] || context.lzName || ((_b = posts[0]) == null ? void 0 : _b.authorName) || "未知作者";
  }

  // src/parser.js
  function cleanPostFragment(root) {
    root.querySelectorAll([
      ".pstatus",
      ".quote",
      "blockquote",
      ".aimg_tip",
      ".pct",
      ".sign",
      "script",
      "style"
    ].join(",")).forEach((node) => node.remove());
    root.querySelectorAll("img").forEach((img) => {
      const alt = (img.getAttribute("alt") || "").trim();
      img.replaceWith(document.createTextNode(alt ? `[图片:${alt}]` : "[图片]"));
    });
  }
  function htmlToText(root) {
    const working = root.cloneNode(true);
    working.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    const blockSelectors = ["p", "div", "section", "article", "li", "tr", "td", "h1", "h2", "h3", "h4", "h5", "h6"];
    working.querySelectorAll(blockSelectors.join(",")).forEach((node) => {
      if (!node.textContent || !node.textContent.trim()) return;
      if (!node.textContent.endsWith("\n")) node.appendChild(document.createTextNode("\n"));
    });
    let text = working.textContent || "";
    text = text.replace(/\r/g, "");
    text = text.replace(/[ \t]+\n/g, "\n");
    text = text.replace(/\n{3,}/g, "\n\n");
    text = text.replace(/^\s+|\s+$/g, "");
    const noisePatterns = [
      /本帖最后由.+?编辑/g,
      /电梯直达/g,
      /显示全部楼层/g,
      /倒序浏览/g,
      /阅读模式/g,
      /点评\s*回复\s*举报/g,
      /只看楼主/g,
      /只看该作者/g
    ];
    noisePatterns.forEach((pattern) => {
      text = text.replace(pattern, "");
    });
    return text.replace(/\n{3,}/g, "\n\n").trim();
  }
  function extractPosts(doc, context) {
    const postNodes = collectPostNodes(doc);
    return postNodes.map((postNode) => {
      const messageNode = findMessageNode(postNode);
      if (!messageNode) return null;
      const cleanFragment = messageNode.cloneNode(true);
      cleanPostFragment(cleanFragment);
      const authorProfileUrl = extractAuthorProfileUrl(postNode);
      const authorUid = uidFromProfileUrl(authorProfileUrl);
      return {
        postId: postNode.id.replace("post_", ""),
        page: context.currentPage,
        floor: extractFloor(postNode),
        authorName: extractAuthorName(postNode),
        authorUid,
        authorProfileUrl,
        publishedAt: extractPublishedAt(postNode),
        isLz: authorUid === context.lzUid,
        fromMobile: /来自手机/.test(textOf(postNode.querySelector(".authi"))),
        rawHtml: messageNode.innerHTML,
        cleanHtml: cleanFragment.innerHTML,
        text: htmlToText(cleanFragment)
      };
    }).filter(Boolean);
  }
  function extractStructuredLines(root) {
    const working = root.cloneNode(true);
    working.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    let text = working.textContent || "";
    text = text.replace(/\r/g, "");
    text = text.replace(/\u00a0/g, " ");
    text = text.replace(/[ \t]+\n/g, "\n");
    text = text.replace(/\n{3,}/g, "\n\n");
    return text.split("\n").map((line) => line.trim()).filter(Boolean);
  }
  function extractFrontMatter(doc) {
    const firstPost = collectPostNodes(doc)[0];
    if (!firstPost) return {};
    const result = {};
    const typeRows = Array.from(firstPost.querySelectorAll(".typeoption tr, .cgtl tr"));
    typeRows.forEach((row) => {
      const key = textOf(row.querySelector("th")).replace(/[：:]\s*$/, "").trim();
      const value = textOf(row.querySelector("td"));
      if (!key || !value) return;
      const normalizedKey = FRONT_MATTER_ALIASES[key] || key;
      if (!(normalizedKey in result)) result[normalizedKey] = value;
    });
    const message = findMessageNode(firstPost);
    if (!message) return orderFrontMatter(result);
    const cleanFragment = message.cloneNode(true);
    cleanPostFragment(cleanFragment);
    const lines = extractStructuredLines(cleanFragment).slice(0, 40);
    lines.forEach((line) => {
      const match = line.match(/^([^：:]{1,8})\s*[：:]\s*(.+)$/);
      if (!match) return;
      const rawKey = match[1].trim();
      const value = match[2].trim();
      if (!value) return;
      const normalizedKey = aliasMap[rawKey] || rawKey;
      if (!KNOWN_FIELD_ORDER.includes(normalizedKey) && rawKey.length > 8) return;
      if (!(normalizedKey in result)) result[normalizedKey] = value;
    });
    return orderFrontMatter(result);
  }
  function dedupePosts(posts) {
    const map = /* @__PURE__ */ new Map();
    posts.forEach((post) => {
      if (!map.has(post.postId)) map.set(post.postId, post);
    });
    return Array.from(map.values());
  }
  function filterPosts(posts, context, authorMode, targetUid) {
    const deduped = dedupePosts(posts).sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      return (a.floor || 0) - (b.floor || 0);
    });
    if (authorMode === "all") return deduped.filter((post) => post.text);
    if (authorMode === "lz") return deduped.filter((post) => post.authorUid && post.authorUid === context.lzUid && post.text);
    return deduped.filter((post) => post.authorUid === targetUid && post.text);
  }

  // src/txt.js
  function renderTxt({ context, posts, authorMode, targetUid, frontMatter, failures, partial }) {
    const lines = [];
    const normalizedFrontMatter = normalizeFrontMatter(frontMatter, context);
    const mainAuthor = resolveMainAuthor({ authorMode, normalizedFrontMatter, context, posts, targetUid });
    lines.push(`标题: ${context.title}`);
    lines.push(`作者: ${mainAuthor}`);
    lines.push(`来源: ${context.canonicalUrl || context.currentUrl}`);
    lines.push("");
    const fmEntries = Object.entries(normalizedFrontMatter || {}).filter(([key, value]) => {
      if (!value) return false;
      if (key === "标题") return false;
      if (key === "作者" && value === mainAuthor) return false;
      return true;
    });
    if (fmEntries.length) {
      lines.push("作品信息:");
      fmEntries.forEach(([key, value]) => {
        lines.push(`${key}: ${value}`);
      });
      lines.push("");
    }
    if (partial) {
      lines.push("状态: 部分导出");
      if (failures.length) {
        lines.push(`失败页: ${failures.map((item) => item.page).join(", ")}`);
      }
      lines.push("");
    }
    lines.push("==================================================");
    lines.push("");
    const groupedSingleAuthor = authorMode !== "all";
    posts.forEach((post, index) => {
      if (!groupedSingleAuthor) {
        lines.push(`[第 ${post.floor || "?"} 楼] ${post.authorName}${post.publishedAt ? ` / ${post.publishedAt}` : ""}`);
        lines.push("");
      } else if (index > 0) {
        lines.push("");
        lines.push("");
      }
      lines.push(post.text);
    });
    return lines.join("\n").replace(/\n{3,}/g, "\n\n");
  }
  function buildFilename(title, authorMode, authorName, format) {
    const ext = format === "epub" ? "epub" : "txt";
    if (authorMode === "all" || !authorName) {
      return `${sanitizeFilename(title)}.${ext}`;
    }
    return `${sanitizeFilename(`${title} - ${authorName}`)}.${ext}`;
  }

  // src/zip.js
  var CRC_TABLE = (function createCrc32Table() {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let j = 0; j < 8; j += 1) {
        c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  })();
  function crc32(bytes) {
    let crc = 4294967295;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ crc >>> 8;
    }
    return (crc ^ 4294967295) >>> 0;
  }
  function concatUint8Arrays(parts) {
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    parts.forEach((part) => {
      result.set(part, offset);
      offset += part.length;
    });
    return result;
  }
  function writeUint16(view, offset, value) {
    view.setUint16(offset, value, true);
  }
  function writeUint32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
  }
  function createZip(entries) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    const records = [];
    let offset = 0;
    entries.forEach((entry) => {
      const nameBytes = encoder.encode(entry.name);
      const dataBytes = typeof entry.data === "string" ? encoder.encode(entry.data) : new Uint8Array(entry.data);
      const crc = crc32(dataBytes);
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(localHeader.buffer);
      writeUint32(localView, 0, 67324752);
      writeUint16(localView, 4, 20);
      writeUint16(localView, 6, 0);
      writeUint16(localView, 8, 0);
      writeUint16(localView, 10, 0);
      writeUint16(localView, 12, 0);
      writeUint32(localView, 14, crc);
      writeUint32(localView, 18, dataBytes.length);
      writeUint32(localView, 22, dataBytes.length);
      writeUint16(localView, 26, nameBytes.length);
      writeUint16(localView, 28, 0);
      localHeader.set(nameBytes, 30);
      localParts.push(localHeader, dataBytes);
      records.push({ nameBytes, dataBytes, crc, offset });
      offset += localHeader.length + dataBytes.length;
    });
    const centralOffset = offset;
    let centralSize = 0;
    records.forEach((record) => {
      const header = new Uint8Array(46 + record.nameBytes.length);
      const view = new DataView(header.buffer);
      writeUint32(view, 0, 33639248);
      writeUint16(view, 4, 20);
      writeUint16(view, 6, 20);
      writeUint16(view, 8, 0);
      writeUint16(view, 10, 0);
      writeUint16(view, 12, 0);
      writeUint16(view, 14, 0);
      writeUint32(view, 16, record.crc);
      writeUint32(view, 20, record.dataBytes.length);
      writeUint32(view, 24, record.dataBytes.length);
      writeUint16(view, 28, record.nameBytes.length);
      writeUint16(view, 30, 0);
      writeUint16(view, 32, 0);
      writeUint16(view, 34, 0);
      writeUint16(view, 36, 0);
      writeUint32(view, 38, 0);
      writeUint32(view, 42, record.offset);
      header.set(record.nameBytes, 46);
      centralParts.push(header);
      centralSize += header.length;
    });
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    writeUint32(endView, 0, 101010256);
    writeUint16(endView, 4, 0);
    writeUint16(endView, 6, 0);
    writeUint16(endView, 8, records.length);
    writeUint16(endView, 10, records.length);
    writeUint32(endView, 12, centralSize);
    writeUint32(endView, 16, centralOffset);
    writeUint16(endView, 20, 0);
    return concatUint8Arrays([...localParts, ...centralParts, end]);
  }

  // src/epub.js
  function makeUuidLike(...parts) {
    const seed = parts.join("|");
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const hex = `00000000${(hash >>> 0).toString(16)}`.slice(-8);
    return `${hex}${hex.slice(0, 4)}-${hex.slice(4, 8)}-4000-8000-${hex}${hex}`;
  }
  function textToXhtml(text) {
    const blocks = String(text || "").split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
    return blocks.map((block) => {
      const withBreaks = escapeXml(block).replace(/\n/g, "<br/>");
      return `<p>${withBreaks}</p>`;
    }).join("\n");
  }
  function wrapXhtmlDocument(title, bodyInnerHtml) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeXml(title)}</title>
  </head>
  <body>
    ${bodyInnerHtml}
  </body>
</html>`;
  }
  function renderContainerXml() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  }
  function renderNavPage(title, chapters) {
    const items = [
      `<li><a href="text/info.xhtml">作品信息</a></li>`,
      ...chapters.map((chapter, index) => `<li><a href="text/chapter-${index + 1}.xhtml">${escapeXml(chapter.navTitle)}</a></li>`)
    ].join("");
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeXml(title)}</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>${escapeXml(title)}</h1>
      <ol>${items}</ol>
    </nav>
  </body>
</html>`;
  }
  function renderInfoPage(context, frontMatter, failures, partial, mainAuthor) {
    const infoRows = [];
    infoRows.push(["标题", context.title]);
    infoRows.push(["作者", mainAuthor]);
    infoRows.push(["来源", context.canonicalUrl || context.currentUrl]);
    Object.entries(frontMatter).forEach(([key, value]) => {
      if (!value || key === "标题") return;
      if (key === "作者" && value === mainAuthor) return;
      infoRows.push([key, value]);
    });
    if (partial) {
      infoRows.push(["状态", "部分导出"]);
      if (failures.length) {
        infoRows.push(["失败页", failures.map((item) => item.page).join(", ")]);
      }
    }
    const rowsHtml = infoRows.map(([key, value]) => `<tr><th>${escapeXml(key)}</th><td>${escapeXml(value)}</td></tr>`).join("");
    return wrapXhtmlDocument("作品信息", `
      <section class="meta-page">
        <h1>作品信息</h1>
        <table class="meta-table">
          <tbody>${rowsHtml}</tbody>
        </table>
      </section>
    `);
  }
  function renderContentOpf({ context, mainAuthor, normalizedFrontMatter, bookId, lang, nowIso, chapters }) {
    const manifestItems = [
      `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
      `<item id="info" href="text/info.xhtml" media-type="application/xhtml+xml"/>`,
      ...chapters.map((_, index) => `<item id="chapter-${index + 1}" href="text/chapter-${index + 1}.xhtml" media-type="application/xhtml+xml"/>`)
    ].join("\n    ");
    const spineItems = [
      `<itemref idref="info"/>`,
      ...chapters.map((_, index) => `<itemref idref="chapter-${index + 1}"/>`)
    ].join("\n    ");
    const subjects = [];
    ["原作", "分级", "警告", "配对", "标签"].forEach((key) => {
      if (normalizedFrontMatter[key]) {
        subjects.push(`<dc:subject>${escapeXml(`${key}:${normalizedFrontMatter[key]}`)}</dc:subject>`);
      }
    });
    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(bookId)}</dc:identifier>
    <dc:title>${escapeXml(context.title)}</dc:title>
    <dc:creator>${escapeXml(mainAuthor)}</dc:creator>
    <dc:language>${lang}</dc:language>
    <dc:source>${escapeXml(context.canonicalUrl || context.currentUrl)}</dc:source>
    ${subjects.join("\n    ")}
    <meta property="dcterms:modified">${escapeXml(nowIso.replace(/\.\d{3}Z$/, "Z"))}</meta>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`;
  }
  function renderChapterXhtml(_bookTitle, chapter) {
    const bodyHtml = textToXhtml(chapter.body);
    return wrapXhtmlDocument(chapter.navTitle, `
      <article>
        ${chapter.headingTitle ? `<h1>${escapeXml(chapter.headingTitle)}</h1>` : ""}
        ${bodyHtml}
      </article>
    `);
  }
  function isHeadingLine(line, headingRegex) {
    const value = String(line || "").trim();
    if (!value || value.length > 80 || !headingRegex) return false;
    headingRegex.lastIndex = 0;
    return headingRegex.test(value);
  }
  function splitPostIntoSegments(text, headingRegex) {
    const lines = String(text || "").split(/\n+/).map((line) => line.trim());
    const segments = [];
    let currentHeading = "";
    let currentLines = [];
    lines.forEach((line) => {
      if (!line) {
        if (currentLines.length) currentLines.push("");
        return;
      }
      if (isHeadingLine(line, headingRegex)) {
        if (currentLines.length) {
          segments.push({
            headingTitle: currentHeading,
            body: currentLines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
          });
        }
        currentHeading = line;
        currentLines = [];
        return;
      }
      currentLines.push(line);
    });
    if (currentHeading || currentLines.length) {
      segments.push({
        headingTitle: currentHeading,
        body: currentLines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
      });
    }
    return segments.filter((segment) => segment.headingTitle || segment.body);
  }
  function buildRegexEpubChapters(posts, headingRegex) {
    const chapters = [];
    let current = null;
    posts.forEach((post) => {
      const segments = splitPostIntoSegments(post.text, headingRegex);
      if (!segments.length) return;
      segments.forEach((segment) => {
        if (segment.headingTitle) {
          if (current && current.body.trim()) chapters.push(current);
          current = { headingTitle: segment.headingTitle, body: segment.body };
          return;
        }
        if (!current) {
          current = { headingTitle: "", body: segment.body };
          return;
        }
        current.body = `${current.body}

${segment.body}`.trim();
      });
    });
    if (current && current.body.trim()) chapters.push(current);
    const usefulChapters = chapters.filter((chapter) => chapter.body && chapter.body.trim());
    if (usefulChapters.length <= 1) return [];
    return usefulChapters;
  }
  function buildEpubChapters(posts, chapterMode, customHeadingRegex) {
    if (chapterMode === "custom" && customHeadingRegex) {
      const customChapters = buildRegexEpubChapters(posts, customHeadingRegex);
      if (customChapters.length) {
        return customChapters.map((chapter, index) => ({
          id: `chapter-${index + 1}`,
          navTitle: chapter.headingTitle || `Chapter ${index + 1}`,
          headingTitle: chapter.headingTitle || "",
          body: chapter.body
        }));
      }
    }
    return posts.map((post, index) => ({
      id: `chapter-${index + 1}`,
      navTitle: `Chapter ${index + 1}`,
      headingTitle: "",
      body: post.text
    }));
  }
  function buildEpub({ context, posts, authorMode, chapterMode, customHeadingRegex, targetUid, frontMatter, failures, partial }) {
    const normalizedFrontMatter = normalizeFrontMatter(frontMatter, context);
    const mainAuthor = resolveMainAuthor({ authorMode, normalizedFrontMatter, context, posts, targetUid });
    const bookId = `urn:uuid:${makeUuidLike(context.tid, context.title, mainAuthor)}`;
    const lang = "zh-CN";
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const chapters = buildEpubChapters(posts, chapterMode, customHeadingRegex);
    const infoXhtml = renderInfoPage(context, normalizedFrontMatter, failures, partial, mainAuthor);
    const navXhtml = renderNavPage(context.title, chapters);
    const opf = renderContentOpf({ context, mainAuthor, normalizedFrontMatter, bookId, lang, nowIso, chapters });
    const files = [
      { name: "mimetype", data: "application/epub+zip", compress: false },
      { name: "META-INF/container.xml", data: renderContainerXml(), compress: false },
      { name: "OEBPS/nav.xhtml", data: navXhtml, compress: false },
      { name: "OEBPS/text/info.xhtml", data: infoXhtml, compress: false },
      { name: "OEBPS/content.opf", data: opf, compress: false },
      ...chapters.map((chapter, index) => ({
        name: `OEBPS/text/chapter-${index + 1}.xhtml`,
        data: renderChapterXhtml(context.title, chapter),
        compress: false
      }))
    ];
    const zipBytes = createZip(files);
    return new Blob([zipBytes], { type: "application/epub+zip" });
  }

  // src/download.js
  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    downloadBlob(filename, blob);
  }

  // src/exporter.js
  async function runExport(panel) {
    var _a;
    const authorMode = panel.querySelector('[data-role="authorMode"]').value;
    const format = panel.querySelector('[data-role="format"]').value;
    const chapterMode = panel.querySelector('[data-role="chapterMode"]').value;
    const targetUidRaw = panel.querySelector('[data-role="uid"]').value.trim();
    const targetUid = targetUidRaw || void 0;
    const customHeadingPattern = panel.querySelector('[data-role="customHeadingPattern"]').value.trim();
    const customHeadingFlags = normalizeRegexFlags(panel.querySelector('[data-role="customHeadingFlags"]').value);
    const customHeadingRegex = buildCustomHeadingRegex(chapterMode, customHeadingPattern, customHeadingFlags);
    if (authorMode === "uid" && !/^\d+$/.test(targetUid || "")) {
      throw new Error("指定作者模式需要填写纯数字 UID");
    }
    state.logs = [];
    state.cancelled = false;
    setRunning(panel, true);
    setStatus(panel, "准备抓取...");
    log(`开始导出，格式=${format}，范围=${authorMode}${targetUid ? `:${targetUid}` : ""}，章节模式=${chapterMode}`);
    const context = extractThreadContext(document, location.href);
    const pageTargets = createPageTargets(context);
    log(`目标页数：${pageTargets.length}，当前线程总页数：${context.pageCount}`);
    const collectedPosts = [];
    const failures = [];
    let firstPageDoc = context.currentPage === 1 ? document : null;
    for (let i = 0; i < pageTargets.length; i += 1) {
      if (state.cancelled) break;
      const target = pageTargets[i];
      setStatus(panel, `抓取第 ${target.page} 页 (${i + 1}/${pageTargets.length})`);
      try {
        const pageDoc = target.page === context.currentPage ? document : await fetchThreadPage(target.url);
        const pageContext = extractThreadContext(pageDoc, target.url);
        const posts = extractPosts(pageDoc, pageContext);
        if (pageContext.currentPage === 1 && !firstPageDoc) firstPageDoc = pageDoc;
        collectedPosts.push(...posts);
        log(`第 ${target.page} 页完成，解析 ${posts.length} 条帖子`);
      } catch (error) {
        failures.push({ page: target.page, message: error.message });
        log(`第 ${target.page} 页失败：${error.message}`);
      }
      if (i < pageTargets.length - 1 && !state.cancelled) {
        await delay(randomInt(1200, 2200));
      }
    }
    const filtered = filterPosts(collectedPosts, context, authorMode, targetUid);
    if (!filtered.length) throw new Error("过滤后没有可导出的正文");
    const frontMatter = extractFrontMatter(firstPageDoc || document);
    const exportPayload = {
      context,
      posts: filtered,
      authorMode,
      chapterMode,
      customHeadingRegex,
      targetUid,
      frontMatter,
      failures,
      partial: state.cancelled || failures.length > 0
    };
    const normalizedFM = normalizeFrontMatter(frontMatter, context);
    const resolvedAuthor = normalizedFM["作者"] || context.lzName || ((_a = filtered[0]) == null ? void 0 : _a.authorName);
    const filename = buildFilename(context.title, authorMode, resolvedAuthor, format);
    if (format === "epub") {
      setStatus(panel, "正在生成 EPUB...");
      const epubBlob = buildEpub(exportPayload);
      downloadBlob(filename, epubBlob);
    } else {
      const txt = renderTxt(exportPayload);
      downloadTextFile(filename, txt);
    }
    const doneMessage = state.cancelled ? `已取消并导出已完成部分，共 ${filtered.length} 条` : failures.length ? `部分成功，已导出 ${filtered.length} 条，失败页 ${failures.map((item) => item.page).join(", ")}` : `导出完成，共 ${filtered.length} 条`;
    setStatus(panel, doneMessage);
    log(doneMessage);
  }

  // src/main.js
  function init() {
    if (document.getElementById(PANEL_ID)) return;
    const panel = buildPanel(runExport);
    const launcher = buildLauncher(panel);
    document.body.appendChild(panel);
    document.body.appendChild(launcher);
    setPanelVisibility(panel, launcher, true);
    log("面板已注入，等待导出。");
  }
  if (!isSupportedThreadPage(document, location.href)) {
  } else if (document.readyState === "loading") {
    ensureStyles();
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    ensureStyles();
    init();
  }
})();
