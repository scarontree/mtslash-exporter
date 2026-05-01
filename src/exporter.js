import { state } from "./constants.js";
import { normalizeRegexFlags, buildCustomHeadingRegex, delay, randomInt } from "./utils.js";
import { extractThreadContext, createPageTargets, fetchThreadPage } from "./scraper.js";
import { extractPosts, extractFrontMatter, filterPosts } from "./parser.js";
import { normalizeFrontMatter } from "./frontmatter.js";
import { renderTxt, buildFilename } from "./txt.js";
import { buildEpub } from "./epub.js";
import { downloadTextFile, downloadBlob } from "./download.js";
import { setRunning, setStatus, log } from "./ui.js";

export async function runExport(panel) {
  const authorMode = panel.querySelector('[data-role="authorMode"]').value;
  const format = panel.querySelector('[data-role="format"]').value;
  const chapterMode = panel.querySelector('[data-role="chapterMode"]').value;
  const targetUidRaw = panel.querySelector('[data-role="uid"]').value.trim();
  const targetUid = targetUidRaw || undefined;
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
      const pageDoc = target.page === context.currentPage
        ? document
        : await fetchThreadPage(target.url);
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
    partial: state.cancelled || failures.length > 0,
  };

  const normalizedFM = normalizeFrontMatter(frontMatter, context);
  const resolvedAuthor = normalizedFM["作者"] || context.lzName || filtered[0]?.authorName;
  const filename = buildFilename(context.title, authorMode, resolvedAuthor, format);

  if (format === "epub") {
    setStatus(panel, "正在生成 EPUB...");
    const epubBlob = buildEpub(exportPayload);
    downloadBlob(filename, epubBlob);
  } else {
    const txt = renderTxt(exportPayload);
    downloadTextFile(filename, txt);
  }

  const doneMessage = state.cancelled
    ? `已取消并导出已完成部分，共 ${filtered.length} 条`
    : failures.length
      ? `部分成功，已导出 ${filtered.length} 条，失败页 ${failures.map((item) => item.page).join(", ")}`
      : `导出完成，共 ${filtered.length} 条`;

  setStatus(panel, doneMessage);
  log(doneMessage);
}
