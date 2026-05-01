import { textOf } from "./utils.js";
import { orderFrontMatter } from "./frontmatter.js";
import {
  collectPostNodes,
  findMessageNode,
  extractAuthorName,
  extractUidFromPost,
  extractAuthorProfileUrl,
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

    return {
      postId: postNode.id.replace("post_", ""),
      page: context.currentPage,
      floor: extractFloor(postNode),
      authorName: extractAuthorName(postNode),
      authorUid: extractUidFromPost(postNode),
      authorProfileUrl: extractAuthorProfileUrl(postNode),
      publishedAt: extractPublishedAt(postNode),
      isLz: extractUidFromPost(postNode) === context.lzUid,
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
  text = text.replace(/ /g, " ");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function extractFrontMatter(doc) {
  const firstPost = collectPostNodes(doc)[0];
  if (!firstPost) return {};

  const aliasMap = {
    cp: "配对", CP: "配对", 配對: "配对",
    tag: "标签", tags: "标签", Tags: "标签",
    summary: "摘要", Summary: "摘要", 简介: "摘要",
    notes: "注释", Notes: "注释", 备注: "注释", note: "注释",
    原文链接: "原文地址", 原文: "原文地址", 链接: "原文地址",
    link: "原文地址", Link: "原文地址",
    分类: "分类", 类型: "分类",
  };
  const knownFieldOrder = ["标题", "原作", "作者", "译者", "分级", "警告", "配对", "标签", "摘要", "注释", "原文地址"];
  const result = {};

  const typeRows = Array.from(firstPost.querySelectorAll(".typeoption tr, .cgtl tr"));
  typeRows.forEach((row) => {
    const key = textOf(row.querySelector("th")).replace(/[：:]\s*$/, "").trim();
    const value = textOf(row.querySelector("td"));
    if (!key || !value) return;
    const normalizedKey = aliasMap[key] || key;
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
    if (!knownFieldOrder.includes(normalizedKey) && rawKey.length > 8) return;
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
