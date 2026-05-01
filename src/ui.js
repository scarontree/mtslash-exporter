import { APP_ID, STYLE_ID, PANEL_ID, LAUNCHER_ID, LOG_LIMIT, state, defaults } from "./constants.js";
import { loadSettings, saveSettings } from "./settings.js";
import { normalizeRegexFlags, escapeAttribute, clamp } from "./utils.js";

// ─── Icons ───────────────────────────────────────────────────────────────────

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

// ─── Styles ──────────────────────────────────────────────────────────────────

export function ensureStyles() {
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

// ─── State helpers ───────────────────────────────────────────────────────────

export function setRunning(panel, running) {
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

export function setStatus(panel, text) {
  const node = panel.querySelector('[data-role="status"]');
  if (node) node.textContent = text;
}

export function log(message) {
  const timestamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  state.logs.push(`[${timestamp}] ${message}`);
  if (state.logs.length > LOG_LIMIT) state.logs.shift();
  const logNode = document.querySelector(`#${PANEL_ID} [data-role="log"]`);
  if (logNode) {
    logNode.value = state.logs.join("\n");
    logNode.scrollTop = logNode.scrollHeight;
  }
}

export function setPanelVisibility(panel, launcher, visible) {
  if (panel) panel.hidden = !visible;
  if (launcher) launcher.hidden = visible;
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function buildPanel(onExport) {
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
      customHeadingFlags: normalizedFlags,
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

// ─── Launcher ────────────────────────────────────────────────────────────────

export function buildLauncher(panel) {
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
      moved: false,
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

  launcher.addEventListener("click", (event) => { event.preventDefault(); });
}
