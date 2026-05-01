import { PANEL_ID } from "./constants.js";
import { isSupportedThreadPage } from "./scraper.js";
import { ensureStyles, buildPanel, buildLauncher, setPanelVisibility, log } from "./ui.js";
import { runExport } from "./exporter.js";

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
  // not a thread page, do nothing
} else if (document.readyState === "loading") {
  ensureStyles();
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  ensureStyles();
  init();
}
