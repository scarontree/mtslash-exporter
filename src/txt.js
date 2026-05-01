import { sanitizeFilename } from "./utils.js";
import { normalizeFrontMatter } from "./frontmatter.js";

export function renderTxt({ context, posts, authorMode, targetUid, frontMatter, failures, partial }) {
  const lines = [];
  const normalizedFrontMatter = normalizeFrontMatter(frontMatter, context);
  const mainAuthor = authorMode === "lz"
    ? normalizedFrontMatter["作者"] || context.lzName
    : authorMode === "uid"
      ? `${posts[0]?.authorName || ""} (${targetUid})`
      : normalizedFrontMatter["作者"] || context.lzName || posts[0]?.authorName || "未知作者";

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

export function buildFilename(title, authorMode, authorName, format) {
  const ext = format === "epub" ? "epub" : "txt";
  if (authorMode === "all" || !authorName) {
    return `${sanitizeFilename(title)}.${ext}`;
  }
  return `${sanitizeFilename(`${title} - ${authorName}`)}.${ext}`;
}
