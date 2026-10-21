import type { LegalSourceReference } from "@policymate/contracts";

/**
 * 事故研判意见的事后引用核对（ADR-0019）。
 *
 * 模型写出的「《法源名称》第X条」必须能在本次适用法源集的条款里找到，否则
 * 后端不得让它以确定引用的样子出现在民警面前。这里只做**标注与降级**，不
 * 重新生成、也不丢弃输出：命中条目附上原文与链接，未命中条目就地标注
 * 「条号未经核对」。该核对不改变“研判意见不是官方认定”的定位。
 */

/** 中文数字条号与阿拉伯数字条号都接受；不改写原文，只用于查找。 */
const CITATION_PATTERN = /《([^》]{1,60})》\s*(第[零一二三四五六七八九十百千0-9]+条)/g;

export interface VerifiedCitation {
  /** 报告里出现过的法源名（保留模型写法）。 */
  title: string;
  article: string;
  /** 后端从受治理法源里取出的条文原文，不是模型写的。 */
  minimalText: string;
  version: string;
  officialUrl: string | null;
}

export interface CitationCheckResult {
  /** 已核对通过的确定引用，按出现顺序去重。 */
  verified: VerifiedCitation[];
  /** 未能在本次适用法源集中找到的引用（已就地降级标注）。 */
  unverified: Array<{ title: string; article: string }>;
  /** 替换掉未命中引用标注后的报告正文。 */
  text: string;
}

const UNVERIFIED_MARK = "〔条号未经核对〕";

/**
 * 把报告正文里每处「《法源名称》第X条」与本次适用法源集比对。
 *
 * 命中规则：法源名与条号必须同时匹配同一条受治理记录。只匹配名称不匹配条号
 * 视为未命中——否则模型可以给一条正确法源配一个编造的条号。
 */
export function checkCitations(
  text: string,
  legalSources: readonly LegalSourceReference[],
): CitationCheckResult {
  const verified: VerifiedCitation[] = [];
  const unverified: Array<{ title: string; article: string }> = [];
  const seen = new Set<string>();

  const rewritten = text.replace(CITATION_PATTERN, (match, rawTitle: string, rawArticle: string, offset: number) => {
    const title = rawTitle.trim();
    const article = rawArticle.trim();
    const key = `${title}#${article}`;
    const source = legalSources.find((candidate) => candidate.title === title);
    const found = source?.articles.find((candidate) => candidate.location === article);
    // 已经标注过的位置（上一次处理过或人工标注）不重复追加。
    const alreadyMarked = text.slice(offset + match.length).startsWith(UNVERIFIED_MARK);
    if (source === undefined || found === undefined) {
      if (!seen.has(key)) {
        seen.add(key);
        unverified.push({ title, article });
      }
      return alreadyMarked ? match : `${match}${UNVERIFIED_MARK}`;
    }
    if (!seen.has(key)) {
      seen.add(key);
      verified.push({
        title,
        article,
        minimalText: found.minimalText,
        version: source.version,
        officialUrl: source.officialUrl,
      });
    }
    return match;
  });

  return { verified, unverified, text: rewritten };
}

/** 由后端追加到研判意见末尾的核对说明；不经过模型。 */
export function citationNotice(result: CitationCheckResult): string {
  const lines: string[] = ["", "依据核对（系统比对本次受治理法源，非模型输出）"];
  if (result.verified.length === 0 && result.unverified.length === 0) {
    lines.push("- 本报告未写出条号，未做条文比对；方向提示请自行核对现行法。");
    return lines.join("\n");
  }
  for (const item of result.verified) {
    lines.push(`- ${item.title}${item.article}（${item.version}）：${item.minimalText}`);
    if (item.officialUrl !== null) lines.push(`  官方链接：${item.officialUrl}`);
  }
  for (const item of result.unverified) {
    lines.push(
      `- ${item.title}${item.article}：未在本次受治理法源中找到，已标注「条号未经核对」，请自行核对现行条文。`,
    );
  }
  return lines.join("\n");
}
