import { createZip } from "./zip.js";
import { escapeXml, escapeAttribute } from "./utils.js";
import { normalizeFrontMatter, resolveMainAuthor } from "./frontmatter.js";

function makeUuidLike(...parts) {
  const seed = parts.join("|");
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (`00000000${(hash >>> 0).toString(16)}`).slice(-8);
  return `${hex}${hex.slice(0, 4)}-${hex.slice(4, 8)}-4000-8000-${hex}${hex}`;
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
  const infoRows = [];
  infoRows.push(["标题", context.title]);
  infoRows.push(["作者", mainAuthor]);
  infoRows.push(["来源", context.canonicalUrl || context.currentUrl]);
  Object.entries(frontMatter).forEach(([key, value]) => {
    if (!value || key === "标题") return;
    if (key === "作者" && value === mainAuthor) return;
    infoRows.push([key, value]);
  });
  if (partial) {
    infoRows.push(["状态", "部分导出"]);
    if (failures.length) {
      infoRows.push(["失败页", failures.map((item) => item.page).join(", ")]);
    }
  }

  const rowsHtml = infoRows.map(([key, value]) => (
    `<tr><th>${escapeXml(key)}</th><td>${escapeXml(value)}</td></tr>`
  )).join("");

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

function isHeadingLine(line, headingRegex) {
  const value = String(line || "").trim();
  if (!value || value.length > 80 || !headingRegex) return false;
  headingRegex.lastIndex = 0;
  return headingRegex.test(value);
}

function splitPostIntoSegments(text, headingRegex) {
  const lines = String(text || "").split(/\n+/).map((line) => line.trim());
  const segments = [];
  let currentHeading = "";
  let currentLines = [];

  lines.forEach((line) => {
    if (!line) {
      if (currentLines.length) currentLines.push("");
      return;
    }
    if (isHeadingLine(line, headingRegex)) {
      if (currentLines.length) {
        segments.push({
          headingTitle: currentHeading,
          body: currentLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
        });
      }
      currentHeading = line;
      currentLines = [];
      return;
    }
    currentLines.push(line);
  });

  if (currentHeading || currentLines.length) {
    segments.push({
      headingTitle: currentHeading,
      body: currentLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    });
  }

  return segments.filter((segment) => segment.headingTitle || segment.body);
}

function buildRegexEpubChapters(posts, headingRegex) {
  const chapters = [];
  let current = null;

  posts.forEach((post) => {
    const segments = splitPostIntoSegments(post.text, headingRegex);
    if (!segments.length) return;

    segments.forEach((segment) => {
      if (segment.headingTitle) {
        if (current && current.body.trim()) chapters.push(current);
        current = { headingTitle: segment.headingTitle, body: segment.body };
        return;
      }
      if (!current) {
        current = { headingTitle: "", body: segment.body };
        return;
      }
      current.body = `${current.body}\n\n${segment.body}`.trim();
    });
  });

  if (current && current.body.trim()) chapters.push(current);

  const usefulChapters = chapters.filter((chapter) => chapter.body && chapter.body.trim());
  if (usefulChapters.length <= 1) return [];
  return usefulChapters;
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
