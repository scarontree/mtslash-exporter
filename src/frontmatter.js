const KNOWN_FIELD_ORDER = ["标题", "原作", "作者", "译者", "分级", "警告", "配对", "标签", "摘要", "注释", "原文地址"];

export function normalizeFrontMatter(frontMatter, context) {
  const normalized = {};
  const source = frontMatter || {};

  KNOWN_FIELD_ORDER.forEach((key) => {
    if (source[key]) {
      normalized[key] = source[key];
    }
  });

  Object.keys(source).forEach((key) => {
    if (!(key in normalized) && source[key]) {
      normalized[key] = source[key];
    }
  });

  if (!normalized["标题"]) {
    normalized["标题"] = context.title;
  }
  if (!normalized["作者"] && context.lzName) {
    normalized["作者"] = context.lzName;
  }

  return normalized;
}

export function orderFrontMatter(result) {
  const ordered = {};
  KNOWN_FIELD_ORDER.forEach((key) => {
    if (key in result) {
      ordered[key] = result[key];
    }
  });
  Object.keys(result).forEach((key) => {
    if (!(key in ordered)) {
      ordered[key] = result[key];
    }
  });
  return ordered;
}
