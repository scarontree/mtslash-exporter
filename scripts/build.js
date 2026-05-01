import * as esbuild from "esbuild";

const USERSCRIPT_HEADER = `// ==UserScript==
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
// ==/UserScript==`;

const isWatch = process.argv.includes("--watch");

const ctx = await esbuild.context({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  outfile: "dist/MTSLASH Exporter.user.js",
  banner: { js: USERSCRIPT_HEADER },
  target: ["chrome90", "firefox90"],
  charset: "utf8",
});

if (isWatch) {
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log("Build complete → dist/MTSLASH Exporter.user.js");
}
