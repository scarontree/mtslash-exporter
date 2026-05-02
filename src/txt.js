import { sanitizeFilename } from "./utils.js";
import { normalizeFrontMatter, resolveMainAuthor, buildInfoRows } from "./frontmatter.js";

// ─── 渲染 ─────────────────────────────────────────────────────────────────────

export function renderTxt({ context, posts, authorMode, targetUid, frontMatter, failures, partial }) {
  const lines = [];
  const normalizedFrontMatter = normalizeFrontMatter(frontMatter, context);
  const mainAuthor = resolveMainAuthor({ authorMode, normalizedFrontMatter, context, posts, targetUid });

  const infoRows = buildInfoRows(context, normalizedFrontMatter, mainAuthor, failures, partial);
  infoRows.forEach(([key, value]) => lines.push(`${key}: ${value}`));
  lines.push("");

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

// ─── 文件名 ───────────────────────────────────────────────────────────────────

export function buildFilename(title, authorMode, authorName, format) {
  const ext = format === "epub" ? "epub" : "txt";
  if (authorMode === "all" || !authorName) {
    return `${sanitizeFilename(title)}.${ext}`;
  }
  return `${sanitizeFilename(`${title} - ${authorName}`)}.${ext}`;
}
