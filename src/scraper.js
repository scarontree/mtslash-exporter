import { textOf, delay, randomInt } from "./utils.js";
import { log } from "./ui.js";

const FETCH = {
  maxRetries: 3,
  retryBaseMs: 1500,
  retryMaxMs: 8000,
  retryJitterMin: 500,
  retryJitterMax: 1500,
  dsignDelayMin: 300,
  dsignDelayMax: 800,
};

// ─── DOM helpers ────────────────────────────────────────────────────────────

const AUTHOR_LINK_SELECTORS = [
  ".pls .authi a.xw1",
  '.pls a[href*="space-uid-"]',
  '.authi a[href*="space-uid-"]',
  '.authi a[href*="uid="]',
  'a[href*="space-uid-"]',
  'a[href*="mod=space&uid="]',
].join(",");

export function collectPostNodes(doc) {
  const explicitNodes = Array.from(
    doc.querySelectorAll('div[id^="post_"], li[id^="post_"], div[id^="pid"], li[id^="pid"]'),
  );
  const fallbackNodes = Array.from(doc.querySelectorAll(".message, .postmessage")).map((node) => (
    node.closest('li[id], div[id], table[id], article[id]') || node
  ));
  const unique = new Map();
  [...explicitNodes, ...fallbackNodes].forEach((node) => {
    if (!node || unique.has(node)) return;
    if (findMessageNode(node)) unique.set(node, true);
  });
  return Array.from(unique.keys());
}

export function findMessageNode(postNode) {
  return postNode.querySelector([
    '[id^="postmessage_"]',
    ".message",
    ".postmessage",
    ".pcb .t_f",
  ].join(","));
}

function findAuthorLink(postNode) {
  return postNode.querySelector(AUTHOR_LINK_SELECTORS);
}

export function extractAuthorName(postNode) {
  const fromLink = textOf(findAuthorLink(postNode));
  if (fromLink) return fromLink;
  const fromMeta = textOf(postNode.querySelector(".user_info .name, .userinfo .name"));
  return fromMeta || "未知作者";
}

export function extractAuthorProfileUrl(postNode) {
  const link = findAuthorLink(postNode);
  return link ? new URL(link.getAttribute("href"), location.origin).toString() : undefined;
}

export function uidFromProfileUrl(href) {
  if (!href) return undefined;
  const match = href.match(/(?:uid=|space-uid-)(\d+)/);
  return match ? match[1] : undefined;
}

export function extractUidFromPost(postNode) {
  return uidFromProfileUrl(extractAuthorProfileUrl(postNode));
}

export function extractFloor(postNode) {
  const floorLink = postNode.querySelector(".plc .pi strong a")
    || postNode.querySelector('.plc .pi a[href*="findpost"]')
    || Array.from(postNode.querySelectorAll(".plc .pi a, .authi a, a")).find((node) => /#/.test(node.textContent || ""));
  const floorText = textOf(floorLink)
    || textOf(postNode.querySelector(".plc .pi"))
    || textOf(postNode.querySelector(".authi"))
    || textOf(postNode);
  const match = floorText.match(/(\d+)\s*#|第\s*(\d+)\s*楼/);
  return match ? parseInt(match[1] || match[2], 10) : undefined;
}

export function extractPublishedAt(postNode) {
  const candidates = [
    textOf(postNode.querySelector(".plc .pi .authi")),
    textOf(postNode.querySelector(".authi")),
    textOf(postNode.querySelector(".user_info")),
    textOf(postNode.querySelector(".userinfo")),
    textOf(postNode),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const postTimeMatch = candidate.match(/发表于\s*([^\n|]+)/);
    if (postTimeMatch) return postTimeMatch[1].trim();
    const genericMatch = candidate.match(/(\d{4}-\d{1,2}-\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)/);
    if (genericMatch) return genericMatch[1].trim();
  }
  return undefined;
}

export function looksLikeBlockedPage(html) {
  return [
    "尚未登录",
    "没有权限",
    "页面重载开启",
    "页面正在重新载入",
    "提示信息",
    "请输入验证码",
    "操作太频繁",
    "您的访问受限",
    "指定的主题不存在",
    "抱歉，您没有权限",
  ].some((needle) => html.includes(needle));
}

export function isSupportedThreadPage(_doc, url) {
  const parsed = new URL(url, location.origin);
  return parsed.pathname.includes("thread-") || parsed.searchParams.get("mod") === "viewthread";
}

// ─── Title ──────────────────────────────────────────────────────────────────

export function extractThreadTitle(doc) {
  const candidates = [
    "#thread_subject",
    "h1.ts",
    ".thread_subject",
    ".thread-title",
    ".thread_tit",
    ".view_tit",
    ".tit",
    ".message h2 strong",
    "h1",
    "h2",
  ];
  for (const selector of candidates) {
    const el = doc.querySelector(selector);
    if (!el) continue;
    const title = cleanTitleElement(el);
    if (title && !/^(提示信息|用户登录)$/.test(title)) return title;
  }
  const pageTitle = textOf(doc.querySelector("title")).replace(/\s*-\s*随缘居.*$/, "").trim();
  return /^(提示信息|用户登录)$/.test(pageTitle) ? "" : pageTitle;
}

function cleanTitleElement(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll('a[href*="authorid"], a[href*="only"]').forEach((link) => link.remove());
  let text = (clone.textContent || "").trim();
  text = text.replace(/\s*(只看楼主|只看该作者|电梯直达|显示全部楼层|倒序浏览|阅读模式)\s*/g, "");
  text = text.replace(/\s{2,}/g, " ").trim();
  return text;
}

// ─── URL/TID helpers ────────────────────────────────────────────────────────

function tidFromUrl(url) {
  if (!(url instanceof URL)) return null;
  return url.searchParams.get("tid")
    || (url.pathname.match(/thread-(\d+)-/) || [])[1]
    || null;
}

export function extractTid(url, doc) {
  const fromUrl = tidFromUrl(url);
  if (fromUrl) return fromUrl;
  const copyLink = doc.querySelector('a[href*="thread-"]');
  const href = copyLink ? copyLink.getAttribute("href") || "" : "";
  const fromDom = (href.match(/thread-(\d+)-/) || [])[1];
  if (fromDom) return fromDom;
  throw new Error("无法解析 tid");
}

function pageFromPath(pathname) {
  return (pathname.match(/thread-\d+-(\d+)-/) || [])[1] || null;
}

function isSameThreadPage(targetUrl, currentUrl) {
  if (!(targetUrl instanceof URL) || !(currentUrl instanceof URL)) return false;
  const currentTid = tidFromUrl(currentUrl);
  const targetTid = tidFromUrl(targetUrl);
  if (currentTid && targetTid) return currentTid === targetTid;
  return targetUrl.pathname === currentUrl.pathname;
}

function parsePageValue(urlLike) {
  if (!(urlLike instanceof URL)) return undefined;
  const value = urlLike.searchParams.get("page") || pageFromPath(urlLike.pathname) || "1";
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

// ─── Pager ──────────────────────────────────────────────────────────────────

function findThreadPager(doc, currentUrl) {
  const pagers = Array.from(doc.querySelectorAll(".pg, .page"));
  if (!pagers.length) return null;

  let bestPager = null;
  let bestScore = -1;
  pagers.forEach((pager) => {
    let score = 0;
    pager.querySelectorAll("a, strong, em").forEach((node) => {
      const text = (node.textContent || "").trim();
      if (/^\d+$/.test(text)) score += 1;
      if (!(node instanceof HTMLAnchorElement)) return;
      try {
        const target = new URL(node.getAttribute("href"), currentUrl);
        if (isSameThreadPage(target, currentUrl)) score += 3;
      } catch (_error) {
        // ignore
      }
    });
    if (pager.querySelector('label input[type="text"]')) score += 2;
    const mobilePageSelect = pager.querySelector('select#dumppage, select[name="page"]');
    if (mobilePageSelect) {
      score += 4;
      score += mobilePageSelect.querySelectorAll("option").length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestPager = pager;
    }
  });

  return bestScore > 0 ? bestPager : pagers[0];
}

export function parsePageData(doc, currentUrl) {
  const pager = findThreadPager(doc, currentUrl);
  const pagerValues = new Set();
  const currentPageFromUrl = parsePageValue(currentUrl) || 1;
  const mobilePageSelect = pager ? pager.querySelector('select#dumppage, select[name="page"]') : null;

  if (pager) {
    pager.querySelectorAll("a, strong, em").forEach((node) => {
      const value = parseInt((node.textContent || "").trim(), 10);
      if (!Number.isNaN(value)) pagerValues.add(value);
      if (!(node instanceof HTMLAnchorElement)) return;
      try {
        const target = new URL(node.getAttribute("href"), currentUrl);
        if (!isSameThreadPage(target, currentUrl)) return;
        const pageValue = parsePageValue(target);
        if (pageValue) pagerValues.add(pageValue);
      } catch (_error) {
        // ignore
      }
    });
  }

  if (mobilePageSelect) {
    Array.from(mobilePageSelect.options).forEach((option) => {
      const value = parseInt(option.value || option.textContent || "", 10);
      if (!Number.isNaN(value)) pagerValues.add(value);
    });
  }

  const pageInput = pager ? pager.querySelector('label input[type="text"]') : null;
  const mobileCurrentOption = mobilePageSelect
    ? mobilePageSelect.options[mobilePageSelect.selectedIndex]
    : null;
  const currentPage = pageInput
    ? parseInt(pageInput.value, 10) || currentPageFromUrl
    : mobileCurrentOption
      ? parseInt(mobileCurrentOption.value || mobileCurrentOption.textContent || "", 10) || currentPageFromUrl
      : currentPageFromUrl;

  let pageCount = Math.max(...Array.from(pagerValues), currentPage, 1);
  const pageLabel = pager ? pager.querySelector("label") : null;
  const match = pageLabel ? pageLabel.textContent.match(/\/\s*(\d+)\s*页/) : null;
  if (match) {
    pageCount = parseInt(match[1], 10);
  } else if (mobilePageSelect && mobilePageSelect.options.length) {
    pageCount = Math.max(
      ...Array.from(mobilePageSelect.options).map((option) => (
        parseInt(option.value || option.textContent || "", 10) || 0
      )),
      currentPage,
      1,
    );
  }

  return { currentPage, pageCount, canonicalBase: currentUrl.toString() };
}

// ─── URL builders ───────────────────────────────────────────────────────────

export function buildPageUrl(context, page) {
  const currentUrl = new URL(context.currentUrl || location.href, location.origin);
  if (currentUrl.pathname.includes("thread-")) {
    currentUrl.pathname = `/thread-${context.tid}-${page}-1.html`;
    currentUrl.search = "";
    return currentUrl.toString();
  }
  currentUrl.searchParams.set("mod", "viewthread");
  currentUrl.searchParams.set("tid", context.tid);
  currentUrl.searchParams.set("page", String(page));
  return currentUrl.toString();
}

export function buildCanonicalThreadUrl(tid) {
  return `${location.origin}/thread-${tid}-1-1.html`;
}

export function createPageTargets(context) {
  const targets = [];
  for (let page = 1; page <= context.pageCount; page += 1) {
    targets.push({ page, url: buildPageUrl(context, page) });
  }
  return targets;
}

// ─── Charset / HTML decode ──────────────────────────────────────────────────

function normalizeCharset(charset) {
  const value = String(charset || "").trim().toLowerCase();
  if (value === "gb2312" || value === "gbk" || value === "gb18030") return "gbk";
  return value || "utf-8";
}

function detectCharset(response) {
  const contentType = response.headers.get("content-type") || "";
  const headerMatch = contentType.match(/charset=([^;]+)/i);
  if (headerMatch) return normalizeCharset(headerMatch[1]);
  if (location.hostname === "www.mtslash.life") return "gbk";
  return "utf-8";
}

export function decodeHtml(buffer, response) {
  const charset = detectCharset(response);
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch (_error) {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

// ─── _dsign challenge ───────────────────────────────────────────────────────

export function extractDsignChallengeUrl(html, originalUrl) {
  if (html.length > 5000) return null;
  if (!html.includes("location") || !html.includes("replace")) return null;
  if (html.includes("postmessage_") || html.includes("thread_subject")) return null;

  try {
    const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (!scriptMatch) return null;
    const scriptCode = scriptMatch[1];

    let locationUrl = null;
    let windowUrl = null;
    const locationProxy = new Proxy({}, {
      set(_target, _prop, value) {
        if (typeof value === "string" && value.includes("thread-")) locationUrl = value;
        return true;
      },
      get(_target, prop) {
        if (prop === "replace" || prop === "assign") return (url) => { locationUrl = url; };
        if (prop === "href") return "";
        return undefined;
      },
    });
    const windowProxy = new Proxy({}, {
      set(_target, _prop, value) {
        if (typeof value === "string" && value.includes("thread-")) windowUrl = value;
        return true;
      },
      get(_target, prop) {
        if (prop === "href") return "";
        return undefined;
      },
    });

    const fn = new Function("location", "window", scriptCode);
    fn(locationProxy, windowProxy);

    const candidates = [locationUrl, windowUrl].filter(Boolean);
    const bestUrl = candidates.find((v) => v.includes("_dsign") || v.includes("dsign")) || candidates[0];
    if (bestUrl) return new URL(bestUrl, originalUrl).toString();
  } catch (_error) {
    // ignore
  }

  const dsignMatch = html.match(/_dsign['"]?\s*[=+]\s*['"]([a-f0-9]+)/i)
    || html.match(/dsign=([a-f0-9]{6,})/i);
  if (dsignMatch) {
    try {
      const base = new URL(originalUrl);
      base.searchParams.set("_dsign", dsignMatch[1]);
      return base.toString();
    } catch (_error) {
      // ignore
    }
  }

  return null;
}

// ─── Network ────────────────────────────────────────────────────────────────

export async function fetchThreadPage(url) {
  let currentUrl = url;
  for (let attempt = 1; attempt <= FETCH.maxRetries; attempt += 1) {
    try {
      log(`请求第 ${attempt} 次：${currentUrl}`);
      const response = await fetch(currentUrl, { credentials: "include", method: "GET" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const buffer = await response.arrayBuffer();
      const html = decodeHtml(buffer, response);
      const challengeUrl = extractDsignChallengeUrl(html, currentUrl);
      if (challengeUrl) {
        log(`检测到 _dsign 安全验证，重定向至: ${challengeUrl}`);
        currentUrl = challengeUrl;
        await delay(randomInt(FETCH.dsignDelayMin, FETCH.dsignDelayMax));
        continue;
      }

      if (looksLikeBlockedPage(html)) throw new Error("命中登录/权限/重载提示页");

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      if (!isSupportedThreadPage(doc, url)) throw new Error("返回内容不是有效线程页");
      return doc;
    } catch (error) {
      if (attempt >= FETCH.maxRetries) throw error;
      const backoff = Math.min(FETCH.retryBaseMs * Math.pow(2, attempt - 1), FETCH.retryMaxMs);
      await delay(backoff + randomInt(FETCH.retryJitterMin, FETCH.retryJitterMax));
    }
  }
  throw new Error("抓取失败");
}

// ─── Thread context ──────────────────────────────────────────────────────────

export function extractThreadContext(doc, url) {
  const normalizedUrl = new URL(url, location.origin);
  const title = extractThreadTitle(doc);
  if (!title) throw new Error("未找到帖子标题，当前页面可能不是可访问的线程页");

  const pageData = parsePageData(doc, normalizedUrl);
  const tid = extractTid(normalizedUrl, doc);
  const posts = collectPostNodes(doc);
  if (!posts.length) throw new Error("未找到帖子楼层，页面可能是权限页或异常页");

  let lzUid = null;
  let lzName = null;

  const tathHeader = doc.querySelector("#tath");
  if (tathHeader) {
    const tathLinks = tathHeader.querySelectorAll('a[href*="space-uid-"], a[href*="mod=space"]');
    for (const lzLink of tathLinks) {
      const href = lzLink.getAttribute("href") || "";
      const uidMatch = href.match(/uid[-=](\d+)/);
      const name = textOf(lzLink) || lzLink.getAttribute("title") || "";
      if (uidMatch) {
        lzUid = uidMatch[1];
        if (name) lzName = name;
      }
    }
  }

  if (!lzUid) {
    const allAuthoridLinks = doc.querySelectorAll('a[href*="authorid"]');
    for (const link of allAuthoridLinks) {
      if ((link.textContent || "").trim() === "只看楼主") {
        const uidMatch = (link.getAttribute("href") || "").match(/authorid[=](\d+)/);
        if (uidMatch) { lzUid = uidMatch[1]; }
        break;
      }
    }
  }

  if (!lzUid) {
    lzUid = extractUidFromPost(posts[0]);
    lzName = extractAuthorName(posts[0]);
  }

  if (lzUid && !lzName) {
    for (const postNode of posts) {
      if (extractUidFromPost(postNode) === lzUid) {
        lzName = extractAuthorName(postNode);
        break;
      }
    }
  }

  const uiNoiseNames = ["只看楼主", "只看该作者", "收藏", "回复", "举报", "未知作者"];
  if (lzName && uiNoiseNames.includes(lzName)) lzName = null;

  return {
    title,
    tid,
    pageCount: pageData.pageCount,
    currentPage: pageData.currentPage,
    canonicalBase: pageData.canonicalBase,
    canonicalUrl: buildCanonicalThreadUrl(tid),
    currentUrl: normalizedUrl.toString(),
    lzUid,
    lzName,
  };
}
