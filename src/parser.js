import { textOf } from "./utils.js";
import { orderFrontMatter, FRONT_MATTER_ALIASES } from "./frontmatter.js";
import {
  collectPostNodes,
  findMessageNode,
  extractAuthorName,
  extractAuthorProfileUrl,
  uidFromProfileUrl,
  extractFloor,
  extractPublishedAt,
} from "./scraper.js";

// ─── Post cleaning ───────────────────────────────────────────────────────────

export function cleanPostFragment(root) {
  root.querySelectorAll([
    ".pstatus",
    ".quote",
    "blockquote",
    ".aimg_tip",
    ".pct",
    ".sign",
    "script",
    "style",
  ].join(",")).forEach((node) => node.remove());

  root.querySelectorAll("img").forEach((img) => {
    const alt = (img.getAttribute("alt") || "").trim();
    img.replaceWith(document.createTextNode(alt ? `[图片:${alt}]` : "[图片]"));
  });
}

export function htmlToText(root) {
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

  // Discuz 在 textContent 里混入了这些 UI 文字，不属于帖子正文，需要清掉。
  const noisePatterns = [
    /本帖最后由.+?编辑/g,
    /电梯直达/g,
    /显示全部楼层/g,
    /倒序浏览/g,
    /阅读模式/g,
    /点评\s*回复\s*举报/g,
    /只看楼主/g,
    /只看该作者/g,
  ];
  noisePatterns.forEach((pattern) => { text = text.replace(pattern, ""); });

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

// ─── Post extraction ────────────────────────────────────────────────────────

export function extractPosts(doc, context) {
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
      text: htmlToText(cleanFragment),
    };
  }).filter(Boolean);
}

// ─── Front matter ────────────────────────────────────────────────────────────

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

export function extractFrontMatter(doc) {
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
  // 只扫前 40 行，避免长文正文里的"作者："之类句子被误识别为元数据。
  const lines = extractStructuredLines(cleanFragment).slice(0, 40);

  lines.forEach((line) => {
    const match = line.match(/^([^：:]{1,8})\s*[：:]\s*(.+)$/);
    if (!match) return;
    const rawKey = match[1].trim();
    const value = match[2].trim();
    if (!value) return;
    const normalizedKey = FRONT_MATTER_ALIASES[rawKey] || rawKey;
    if (!(normalizedKey in result)) result[normalizedKey] = value;
  });

  return orderFrontMatter(result);
}

// ─── Filtering ───────────────────────────────────────────────────────────────

export function dedupePosts(posts) {
  const map = new Map();
  posts.forEach((post) => {
    if (!map.has(post.postId)) map.set(post.postId, post);
  });
  return Array.from(map.values());
}

export function filterPosts(posts, context, authorMode, targetUid) {
  const deduped = dedupePosts(posts).sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    return (a.floor || 0) - (b.floor || 0);
  });

  if (authorMode === "all") return deduped.filter((post) => post.text);
  if (authorMode === "lz") return deduped.filter((post) => post.authorUid && post.authorUid === context.lzUid && post.text);
  return deduped.filter((post) => post.authorUid === targetUid && post.text);
}
