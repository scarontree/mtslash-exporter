export const APP_ID = "mtslash-exporter";
export const STYLE_ID = `${APP_ID}-style`;
export const PANEL_ID = `${APP_ID}-panel`;
export const LAUNCHER_ID = `${APP_ID}-launcher`;
export const STORAGE_KEY = `${APP_ID}-settings`;
export const LOG_LIMIT = 120;

export const state = {
  running: false,
  cancelled: false,
  logs: [],
};

export const defaults = {
  authorMode: "lz",
  format: "epub",
  chapterMode: "simple",
  customHeadingPattern: "",
  customHeadingFlags: "",
};
