import { createZip } from "./zip.js";
import { escapeXml } from "./utils.js";
import { normalizeFrontMatter, resolveMainAuthor, buildInfoRows } from "./frontmatter.js";

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

// 用 FNV-1a 哈希生成确定性 UUID。同一个帖子（tid+标题+作者）始终产生相同的 bookId，
// 阅读器可用来去重重复下载。两轮不同 salt 扩展到 64 位，满足 8-4-4-4-12 格式。
function makeUuidLike(...parts) {
  const seed = parts.join("|");
  const fnv = (extra) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i += 1) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= extra;
    return (Math.imul(h, 16777619) >>> 0).toString(16).padStart(8, "0");
  };
  const a = fnv(1);
  const b = fnv(2);
  return `${a}-${b.slice(0, 4)}-4${b.slice(4, 7)}-8${a.slice(0, 3)}-${b}${a.slice(0, 4)}`;
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

// ─── EPUB XML 模板 ────────────────────────────────────────────────────────────

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
    ...chapters.map((chapter, index) => (
      `<li><a href="text/chapter-${index + 1}.xhtml">${escapeXml(chapter.navTitle)}</a></li>`
    )),
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
  const rowsHtml = buildInfoRows(context, frontMatter, mainAuthor, failures, partial)
    .map(([key, value]) => `<tr><th>${escapeXml(key)}</th><td>${escapeXml(value)}</td></tr>`)
    .join("");

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
    ...chapters.map((_, index) => (
      `<item id="chapter-${index + 1}" href="text/chapter-${index + 1}.xhtml" media-type="application/xhtml+xml"/>`
    )),
  ].join("\n    ");

  const spineItems = [
    `<itemref idref="info"/>`,
    ...chapters.map((_, index) => `<itemref idref="chapter-${index + 1}"/>`),
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

// ─── 章节拆分 ─────────────────────────────────────────────────────────────────

function isHeadingLine(line, headingRegex) {
  const value = String(line || "").trim();
  if (!value || value.length > 80 || !headingRegex) return false;
  headingRegex.lastIndex = 0;
  return headingRegex.test(value);
}

// 把所有 post.text 拼成一段后单遍扫行，直接处理跨帖的章节延续。
function buildRegexEpubChapters(posts, headingRegex) {
  const allLines = posts.map((p) => p.text).join("\n\n").split(/\n+/).map((l) => l.trim());
  const chapters = [];
  let curHeading = "";
  let curLines = [];

  const flush = () => {
    const body = curLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (curHeading || body) chapters.push({ headingTitle: curHeading, body });
    curHeading = "";
    curLines = [];
  };

  for (const line of allLines) {
    if (isHeadingLine(line, headingRegex)) {
      flush();
      curHeading = line;
    } else if (line) {
      curLines.push(line);
    } else if (curLines.length) {
      curLines.push("");
    }
  }
  flush();

  const useful = chapters.filter((c) => c.body);
  return useful.length > 1 ? useful : [];
}

function buildEpubChapters(posts, chapterMode, customHeadingRegex) {
  if (chapterMode === "custom" && customHeadingRegex) {
    const customChapters = buildRegexEpubChapters(posts, customHeadingRegex);
    if (customChapters.length) {
      return customChapters.map((chapter, index) => ({
        id: `chapter-${index + 1}`,
        navTitle: chapter.headingTitle || `Chapter ${index + 1}`,
        headingTitle: chapter.headingTitle || "",
        body: chapter.body,
      }));
    }
  }

  return posts.map((post, index) => ({
    id: `chapter-${index + 1}`,
    navTitle: `Chapter ${index + 1}`,
    headingTitle: "",
    body: post.text,
  }));
}

// ─── 主构建入口 ───────────────────────────────────────────────────────────────

export function buildEpub({ context, posts, authorMode, chapterMode, customHeadingRegex, targetUid, frontMatter, failures, partial }) {
  const normalizedFrontMatter = normalizeFrontMatter(frontMatter, context);
  const mainAuthor = resolveMainAuthor({ authorMode, normalizedFrontMatter, context, posts, targetUid });
  const bookId = `urn:uuid:${makeUuidLike(context.tid, context.title, mainAuthor)}`;
  const lang = "zh-CN";
  const nowIso = new Date().toISOString();

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
      compress: false,
    })),
  ];

  const zipBytes = createZip(files);
  return new Blob([zipBytes], { type: "application/epub+zip" });
}
