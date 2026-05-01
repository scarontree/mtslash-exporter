export const KNOWN_FIELD_ORDER = ["标题", "原作", "作者", "译者", "分级", "警告", "配对", "标签", "摘要", "注释", "原文地址"];

export const FRONT_MATTER_ALIASES = {
  cp: "配对", CP: "配对", 配對: "配对",
  tag: "标签", tags: "标签", Tags: "标签",
  summary: "摘要", Summary: "摘要", 简介: "摘要",
  notes: "注释", Notes: "注释", 备注: "注释", note: "注释",
  原文链接: "原文地址", 原文: "原文地址", 链接: "原文地址",
  link: "原文地址", Link: "原文地址",
  分类: "分类", 类型: "分类",
};

export function orderFrontMatter(result) {
  const ordered = {};
  KNOWN_FIELD_ORDER.forEach((key) => {
    if (key in result) ordered[key] = result[key];
  });
  Object.keys(result).forEach((key) => {
    if (!(key in ordered)) ordered[key] = result[key];
  });
  return ordered;
}

export function normalizeFrontMatter(frontMatter, context) {
  const source = frontMatter || {};
  const normalized = orderFrontMatter(
    Object.fromEntries(Object.entries(source).filter(([, value]) => value)),
  );

  if (!normalized["标题"]) normalized["标题"] = context.title;
  if (!normalized["作者"] && context.lzName) normalized["作者"] = context.lzName;

  return normalized;
}

// uid 模式只在 targetUid 有值时才加括号，避免出现"张三 (undefined)"。
export function resolveMainAuthor({ authorMode, normalizedFrontMatter, context, posts, targetUid }) {
  if (authorMode === "lz") {
    return normalizedFrontMatter["作者"] || context.lzName;
  }
  if (authorMode === "uid") {
    const name = posts[0]?.authorName || "";
    return `${name}${targetUid ? ` (${targetUid})` : ""}`;
  }
  return normalizedFrontMatter["作者"] || context.lzName || posts[0]?.authorName || "未知作者";
}
