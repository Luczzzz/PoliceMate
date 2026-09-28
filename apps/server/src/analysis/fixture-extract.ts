import type {
  CandidateFact,
  FactCategory,
  FactValue,
  IndependentMatters,
  PrecisionLevel,
  UrgentRiskCategory,
} from "@policymate/contracts";
import {
  FACT_CATEGORY_LABELS,
  FACT_STATUS_LABELS,
  PRECISION_LABELS,
} from "@policymate/contracts";

/**
 * 案情提取的确定性替身（Dify 边界）。
 *
 * 真实接入时由 Dify 工作流返回同构结构；后端负责结构校验，提取质量与本
 * 规则集无关。规则集只覆盖常见表述，无法匹配的部分不会生成事实，
 * 也不会静默截断或改写原文。
 */

const MAX_FACTS = 40;

const CN_EVENT_LABELS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

interface Sentence {
  index: number;
  text: string;
}

/** 人物表述 → 中性代号的有序分配。 */
class AliasRegistry {
  private readonly aliasNames = ["人员甲", "人员乙", "人员丙", "人员丁", "人员戊", "人员己"];
  private next = 0;
  private readonly bySource = new Map<string, string>();

  /** 报案人使用固定角色代号；其余人员按出现顺序获得中性代号。 */
  aliasFor(sourceWording: string): string {
    const normalized = sourceWording.trim();
    if (/报案人|本人/.test(normalized)) {
      if (!this.bySource.has(normalized)) this.bySource.set(normalized, "报案人");
      return "报案人";
    }
    const existing = this.bySource.get(normalized);
    if (existing !== undefined) return existing;
    const alias = this.aliasNames[this.next] ?? `人员${String(this.next + 1).padStart(2, "0")}`;
    this.next += 1;
    this.bySource.set(normalized, alias);
    return alias;
  }

  entries(): Array<{ sourceWording: string; alias: string }> {
    return [...this.bySource.entries()].map(([sourceWording, alias]) => ({ sourceWording, alias }));
  }
}

interface FactDraft {
  category: FactCategory;
  statement: string;
  originalWording: string;
  value: FactValue | null;
  participantRefs: string[];
  eventRef: string | null;
  behaviorRef: string | null;
  riskCategory: UrgentRiskCategory | null;
}

const CN_NUMERALS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/** 解析简体中文数字或阿拉伯数字（最多到万位）。 */
function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,，\s]/g, "");
  if (/^\d+(\.\d+)?$/.test(cleaned)) return Number(cleaned);
  const wanSections = cleaned.split("万");
  let total = 0;
  for (const [index, section] of wanSections.entries()) {
    const multiplier = index < wanSections.length - 1 ? 10_000 : 1;
    let value = 0;
    let current = 0;
    for (const char of section) {
      if (char === "十") {
        value += (current === 0 ? 1 : current) * 10;
        current = 0;
      } else if (char === "百") {
        value += (current === 0 ? 1 : current) * 100;
        current = 0;
      } else if (char === "千") {
        value += (current === 0 ? 1 : current) * 1000;
        current = 0;
      } else {
        const digit = CN_NUMERALS[char];
        if (digit === undefined) return null;
        current = current * 10 + digit;
      }
    }
    value += current;
    if (value === 0 && section !== "零") return null;
    total += value * multiplier;
  }
  return total > 0 ? total : null;
}

function valueOf(
  raw: string,
  precision: PrecisionLevel,
  min: string | null,
  max: string | null,
  unit: string | null,
): FactValue {
  return {
    raw,
    precision,
    precisionLabel: PRECISION_LABELS[precision],
    normalizedMin: min,
    normalizedMax: max,
    unit,
  };
}

const TIME_PART = "(?:凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜)?";

interface RawMatch {
  raw: string;
  precision: PrecisionLevel;
  min: string | number | null;
  max: string | number | null;
}

/** 按优先级匹配时间表述；返回原始表述与规范化范围。 */
function matchTime(sentence: string): RawMatch | null {
  const fullDate = sentence.match(/([12]\d{3})年([01]?\d)月([0-3]?\d)[日号]/);
  if (fullDate) {
    return {
      raw: fullDate[0],
      precision: "exact",
      min: `${fullDate[1]}年${Number(fullDate[2])}月${Number(fullDate[3])}日`,
      max: `${fullDate[1]}年${Number(fullDate[2])}月${Number(fullDate[3])}日`,
    };
  }

  const monthDay = sentence.match(new RegExp(`([01]?\\d)月([0-3]?\\d)[日号]${TIME_PART}`));
  if (monthDay) {
    return {
      raw: monthDay[0],
      precision: "approximate",
      min: `${Number(monthDay[1])}月${Number(monthDay[2])}日`,
      max: `${Number(monthDay[1])}月${Number(monthDay[2])}日`,
    };
  }

  const relative = sentence.match(/上个月|上月|本月|这个月|上周|今天|当天|当日|昨天晚上|昨夜|昨天|前天/);
  if (relative) {
    return { raw: relative[0], precision: "approximate", min: relative[0], max: relative[0] };
  }

  const monthVague = sentence.match(/([01]?\d)月(初|中旬|底|末)/);
  if (monthVague) {
    const month = Number(monthVague[1]);
    const ranges: Record<string, [string, string]> = {
      初: ["1日", "10日"],
      中旬: ["11日", "20日"],
      底: ["21日", "月末"],
      末: ["21日", "月末"],
    };
    const [min, max] = ranges[monthVague[2]];
    return { raw: monthVague[0], precision: "bounded", min: `${month}月${min}`, max: `${month}月${max}` };
  }

  const yearVague = sentence.match(/年初|年中|年底|年末/);
  if (yearVague) {
    const ranges: Record<string, [string, string]> = {
      年初: ["1月1日", "2月末"],
      年中: ["6月1日", "8月末"],
      年底: ["11月1日", "12月31日"],
      年末: ["11月1日", "12月31日"],
    };
    const [min, max] = ranges[yearVague[0]];
    return { raw: yearVague[0], precision: "bounded", min, max };
  }

  const period = sentence.match(/凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜/);
  if (period) {
    return { raw: period[0], precision: "approximate", min: period[0], max: period[0] };
  }

  return null;
}

/** 金额表述 → 数值范围（单位：元）。 */
function matchAmount(sentence: string): RawMatch | null {
  const vague = sentence.match(/([零一二三四五六七八九十两百千两\d.,]+)\s*(?:余|多)\s*(万)?\s*(?:元|块钱|块)/);
  if (vague) {
    const base = parseNumber(vague[1]);
    if (base === null) return null;
    return {
      raw: vague[0],
      precision: "open",
      min: vague[2] === "万" ? base * 10_000 : base,
      max: null,
    };
  }

  const span = sentence.match(
    /([零一二三四五六七八九十两百千两\d.,]+)\s*(?:到|至|[-—])\s*([零一二三四五六七八九十两百千两\d.,]+)\s*(万)?\s*(?:元|块钱|块)/,
  );
  if (span) {
    const min = parseNumber(span[1]);
    const max = parseNumber(span[2]);
    if (min === null || max === null) return null;
    const scale = span[3] === "万" ? 10_000 : 1;
    return { raw: span[0], precision: "bounded", min: min * scale, max: max * scale };
  }

  const exact = sentence.match(/([零一二三四五六七八九十两百千两\d.,]+)\s*(万)?\s*(?:元|块钱|块)/);
  if (exact) {
    const base = parseNumber(exact[1]);
    if (base === null) return null;
    return {
      raw: exact[0],
      precision: "exact",
      min: exact[2] === "万" ? base * 10_000 : base,
      max: exact[2] === "万" ? base * 10_000 : base,
    };
  }

  const rough = sentence.match(/几万|几千/);
  if (rough) {
    return rough[0] === "几万"
      ? { raw: rough[0], precision: "bounded", min: 10_000, max: 99_999 }
      : { raw: rough[0], precision: "bounded", min: 1_000, max: 9_999 };
  }

  return null;
}

function matchAge(sentence: string): RawMatch | null {
  const vague = sentence.match(/([零一二三四五六七八九十两\d]+)\s*(?:多岁|余岁)/);
  if (vague) {
    const base = parseNumber(vague[1]);
    if (base === null) return null;
    return { raw: vague[0], precision: "bounded", min: base, max: base + 9 };
  }
  const around = sentence.match(/([零一二三四五六七八九十两\d]+)\s*岁(?:左右|上下)?/);
  if (around) {
    const base = parseNumber(around[1]);
    if (base === null) return null;
    return { raw: around[0], precision: "approximate", min: base, max: base };
  }
  return null;
}

function matchCount(sentence: string): RawMatch | null {
  const exact = sentence.match(/([零一二三四五六七八九十两\d]+)\s*次/);
  if (exact) {
    const base = parseNumber(exact[1]);
    if (base === null) return null;
    return { raw: exact[0], precision: "exact", min: base, max: base };
  }
  const several = sentence.match(/多次|数次|屡次/);
  if (several) {
    return { raw: several[0], precision: "unknown", min: null, max: null };
  }
  return null;
}

/** 质量数量表述（千克/公斤/毫克/克）→ 数值与单位；用于以重量计量的涉案物品。 */
function matchQuantity(sentence: string): { raw: string; value: number; unit: string } | null {
  const match = sentence.match(/([零一二三四五六七八九十百千两\d.]+)\s*(千克|公斤|毫克|克)/);
  if (match === null) return null;
  const value = parseNumber(match[1]);
  if (value === null) return null;
  return { raw: match[0], value, unit: match[2] };
}

const PLACE_SUFFIX =
  "(?:门口|门前|店内|店里|家中|家里|屋内|路上|市场|小区|车内|网吧|超市|出租屋|宾馆|酒店|学校|宿舍|车站|火车站|广场|楼道)";
const PLACE_PATTERN = new RegExp(`在([^，。；！？、\\s]{2,12})${PLACE_SUFFIX}`);

function matchPlace(sentence: string): string | null {
  const match = sentence.match(PLACE_PATTERN);
  return match === null ? null : match[0].replace(/^在/, "");
}

/**
 * 家庭关系表述：用于把家庭暴力与一般打架斗殴伤害区分开，
 * 只作为行为标签线索，不据此自动认定违法犯罪或者紧急状态。
 */
const FAMILY_RELATION =
  "妻子|丈夫|配偶|前妻|前夫|女友|男友|前女友|前男友|同居|家庭成员|恋人|伴侣|父母|儿子|女儿|养父母|养子女|继父母|继子女";
/** 未成年人表述：用于把侵害未成年人与成年人之间的同类行为区分开。 */
const MINOR_SUBJECT =
  "未成年|儿童|幼女|幼童|幼儿|婴儿|学生|孩子|养子女|继子女|(?:[1-9]|1[0-7])岁的?(?:女儿|儿子|子女)";
/** 家庭暴力的具体行为方式（反家庭暴力法第二条）。 */
const DOMESTIC_ACT =
  "殴打|打伤|掌掴|推搡|威胁|恐吓|辱骂|跟踪|骚扰|纠缠|拘禁|捆绑|残害|家暴|家庭暴力";
/** 直接侵害未成年人人身的行为方式。 */
const MINOR_HARM_ACT =
  "虐待|遗弃|殴打|打伤|掌掴|推搡|猥亵|性侵|强奸|奸淫|拐卖|拐骗|收买|家暴|家庭暴力|暴力伤害";
/**
 * 组织、利用类行为只有在指向明确的不法目的时才构成侵害。单独的“组织/利用”
 * 不足以认定，避免把“学校组织学生参加活动”这类中性表述误判为侵害未成年人。
 */
const MINOR_EXPLOIT_ACT =
  `(?:组织|利用|教唆|强迫|胁迫|引诱|诱骗)[^。！？；]{0,4}(?:${MINOR_SUBJECT})[^。！？；]{0,6}(?:乞讨|盗窃|卖淫|违法犯罪|犯罪活动|黑社会性质组织)`;

/** 行为词库：匹配词 → 中性行为标签。 */
const BEHAVIOR_LEXICON: Array<{ pattern: RegExp; label: string }> = [
  // 涉未成年人侵害与家庭暴力置于一般暴力之前，避免与相邻重点案情混淆。
  {
    pattern: new RegExp(
      `(?:${MINOR_HARM_ACT})[^。！？；]{0,12}(?:${MINOR_SUBJECT})` +
        `|(?:${MINOR_SUBJECT})[^。！？；]{0,12}(?:${MINOR_HARM_ACT})` +
        `|(?:${MINOR_EXPLOIT_ACT})`,
    ),
    label: "侵害未成年人",
  },
  { pattern: /猥亵|性侵|强奸|奸淫|性骚扰/, label: "性侵害" },
  // 成年人拐卖、拐骗、收买不限定被侵害人年龄，标签保持中性、不写成“儿童”。
  { pattern: /拐卖|拐骗|收买被拐卖/, label: "拐卖人口" },
  { pattern: /家暴|家庭暴力/, label: "家庭暴力" },
  {
    pattern: new RegExp(
      `(?:${FAMILY_RELATION})[^。！？；]{0,12}(?:${DOMESTIC_ACT})|(?:${DOMESTIC_ACT})[^。！？；]{0,12}(?:${FAMILY_RELATION})`,
    ),
    label: "家庭暴力",
  },
  { pattern: /持刀|拿刀|持械|匕首/, label: "持械" },
  { pattern: /扬言伤人|扬言报复|威胁|恐吓/, label: "威胁恐吓" },
  { pattern: /殴打|打伤|打了|动手打|推搡|推倒|掌掴|打架|斗殴|互殴/, label: "殴打推搡" },
  { pattern: /闯入|破门|非法侵入/, label: "非法侵入" },
  { pattern: /盗窃|窃取|偷走|偷了|被盗|偷/, label: "盗窃" },
  { pattern: /抢劫|抢走|抢夺|抢/, label: "抢劫抢夺" },
  { pattern: /诈骗|骗取|骗走|骗/, label: "诈骗" },
  { pattern: /侵占|拒不归还/, label: "侵占" },
  { pattern: /损坏|砸坏|毁坏|砸/, label: "故意损毁财物" },
  { pattern: /辱骂/, label: "辱骂" },
  { pattern: /赌博|赌场|赌资|赌局|聚赌|参赌|开赌|下注|投注|六合彩|赌球/, label: "赌博" },
  { pattern: /卖淫|嫖娼|招嫖|嫖资/, label: "卖淫嫖娼" },
  {
    pattern:
      /贩毒|贩卖毒品|运输毒品|制造毒品|非法持有毒品|吸毒|吸食毒品|注射毒品|容留他人吸毒|介绍买卖毒品|海洛因|甲基苯丙胺|冰毒|摇头丸|氯胺酮|可卡因|大麻/,
    label: "涉毒",
  },
];

/** 紧急风险关键词。只用于给事实打标；是否触发提示由确认状态决定。 */
const RISK_KEYWORDS: Array<{ pattern: RegExp; category: UrgentRiskCategory }> = [
  { pattern: /持刀|拿刀|匕首|凶器|扬言伤人|正在行凶/, category: "personal_safety" },
  { pattern: /重伤|流血|昏迷|不省人事|送医|急救/, category: "medical" },
  { pattern: /未成年|孩子|儿童/, category: "minor_protection" },
  { pattern: /家暴|家庭暴力/, category: "domestic_violence" },
  { pattern: /删除|销毁|清空|格式化/, category: "evidence_loss" },
];

/**
 * 行为标签本身即属于优先核验事项：即使原句没有出现字面风险词，仅凭关系表述
 * 识别出的家庭暴力等行为也必须产生可解释提示。
 */
const BEHAVIOR_RISK_FALLBACK: Record<string, UrgentRiskCategory> = {
  侵害未成年人: "minor_protection",
  家庭暴力: "domestic_violence",
};

const RESULT_PATTERN = /轻微伤|轻伤|重伤|擦伤|挫伤|受伤|流血|昏迷|不省人事/;
const OBJECT_PATTERN = /手机|电动车|摩托车|电瓶|自行车|现金|钱包|项链|手镯|笔记本电脑|平板电脑/;

const PERSON_PATTERN =
  /(([一-龥])某|报案人|受害人|被害人|嫌疑人|违法行为人|当事人|司机|店主|老板|室友|前女友|前男友|邻居|同事|房客|租客)/g;

function splitSentences(caseText: string): Sentence[] {
  return caseText
    .split(/[。！？；;\n]+/)
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((text, index) => ({ index, text }));
}

function personsIn(sentence: string, registry: AliasRegistry): Array<{ alias: string; sourceWording: string }> {
  const found: Array<{ alias: string; sourceWording: string }> = [];
  for (const match of sentence.matchAll(PERSON_PATTERN)) {
    const sourceWording = match[0];
    if (found.some((person) => person.sourceWording === sourceWording)) continue;
    found.push({ alias: registry.aliasFor(sourceWording), sourceWording });
  }
  return found;
}

function riskIn(sentence: string): UrgentRiskCategory | null {
  for (const rule of RISK_KEYWORDS) {
    if (rule.pattern.test(sentence)) return rule.category;
  }
  return null;
}

function sentenceBehavior(sentence: string): string | null {
  for (const entry of BEHAVIOR_LEXICON) {
    if (entry.pattern.test(sentence)) return entry.label;
  }
  return null;
}

function eventLabel(index: number): string {
  return `事件${CN_EVENT_LABELS[index] ?? String(index + 1)}`;
}

function behaviorLabel(index: number): string {
  return `行为${CN_EVENT_LABELS[index] ?? String(index + 1)}`;
}

/** 检测彼此独立的事项：不同事件之间没有共同人员、地点或时间。 */
function detectIndependentMatters(
  eventRecords: Array<{ participants: string[]; place: string | null; timeRaw: string | null }>,
  hasConjunction: boolean,
): IndependentMatters {
  if (eventRecords.length < 2) return { detected: false, note: null };

  const sharesInfo = eventRecords.some((a, i) =>
    eventRecords.slice(i + 1).some((b) => {
      const sharedPerson = a.participants.some((alias) => b.participants.includes(alias));
      const sharedPlace = a.place !== null && a.place === b.place;
      const sharedTime = a.timeRaw !== null && a.timeRaw === b.timeRaw;
      return sharedPerson || sharedPlace || sharedTime;
    }),
  );

  if (!(hasConjunction || !sharesInfo)) return { detected: false, note: null };
  return {
    detected: true,
    note: "输入内容可能包含彼此独立的事项（不同事件之间没有共同的人员、地点或时间，或出现了“另外/此外”等表述）。建议拆分为多次分析，每次只覆盖一个连续案情；本产品不会把独立事项合并为一个结论。",
  };
}

export interface ExtractFixtureResult {
  facts: CandidateFact[];
  independentMatters: IndependentMatters;
}

/**
 * 确定性案情提取。输入是纯文本；输出是带稳定 ID、类别、结构化值、原始表述、
 * 事件/参与者/行为关系、来源轮次与精确程度的候选事实。
 */
export function extractCaseFactsFixture(caseText: string): ExtractFixtureResult {
  const registry = new AliasRegistry();
  const sentences = splitSentences(caseText);
  const drafts: FactDraft[] = [];
  const eventRecords: Array<{ participants: string[]; place: string | null; timeRaw: string | null }> = [];
  const hasConjunction = /另外|此外|另一起|还有一起/.test(caseText);

  let eventCounter = 0;
  let behaviorCounter = 0;

  for (const sentence of sentences) {
    const persons = personsIn(sentence.text, registry);
    const participantRefs = persons.map((person) => person.alias);
    const behavior = sentenceBehavior(sentence.text);
    const risk = riskIn(sentence.text);
    const place = matchPlace(sentence.text);
    const time = matchTime(sentence.text);
    const eventRef = behavior === null ? null : eventLabel(eventCounter++);
    const behaviorRef = behavior === null ? null : behaviorLabel(behaviorCounter++);

    if (eventRef !== null) {
      eventRecords.push({
        participants: participantRefs,
        place,
        timeRaw: time === null ? null : time.raw,
      });
    }

    const push = (
      draft: Pick<FactDraft, "category" | "statement" | "originalWording" | "value" | "riskCategory">,
    ) => {
      if (drafts.length >= MAX_FACTS) return;
      drafts.push({
        ...draft,
        participantRefs,
        eventRef,
        behaviorRef: draft.category === "behavior" ? behaviorRef : null,
      });
    };

    if (behavior !== null) {
      push({
        category: "behavior",
        statement:
          participantRefs.length > 0
            ? `${participantRefs.join("、")}实施了「${behavior}」行为`
            : `相关人员实施了「${behavior}」行为`,
        originalWording: sentence.text,
        value: valueOf(behavior, "exact", behavior, behavior, null),
        // 侵害未成年人、家庭暴力行为即使未出现字面风险词，也属于优先核验事项。
        riskCategory: risk ?? BEHAVIOR_RISK_FALLBACK[behavior] ?? null,
      });
    }

    if (time !== null) {
      push({
        category: "time",
        statement: `事件时间表述为「${time.raw}」`,
        originalWording: sentence.text,
        value: valueOf(
          time.raw,
          time.precision,
          time.min === null ? null : String(time.min),
          time.max === null ? null : String(time.max),
          null,
        ),
        riskCategory: null,
      });
    }

    if (place !== null) {
      push({
        category: "place",
        statement: `事件地点表述为「${place}」`,
        originalWording: sentence.text,
        value: valueOf(place, "exact", place, place, null),
        riskCategory: null,
      });
    }

    const amount = matchAmount(sentence.text);
    if (amount !== null) {
      const min = amount.min === null ? null : Number(amount.min);
      const max = amount.max === null ? null : Number(amount.max);
      push({
        category: "amount",
        statement:
          amount.precision === "open"
            ? `涉案金额不低于 ${min} 元`
            : amount.precision === "bounded"
              ? `涉案金额在 ${min}–${max} 元之间`
              : `涉案金额为 ${min} 元`,
        originalWording: sentence.text,
        value: valueOf(amount.raw, amount.precision, min === null ? null : String(min), max === null ? null : String(max), "元"),
        riskCategory: null,
      });
    }

    const age = matchAge(sentence.text);
    if (age !== null) {
      const min = age.min === null ? null : Number(age.min);
      const max = age.max === null ? null : Number(age.max);
      push({
        category: "age",
        statement:
          age.precision === "bounded"
            ? `相关人员年龄在 ${min}–${max} 岁之间`
            : `相关人员年龄约 ${min} 岁`,
        originalWording: sentence.text,
        value: valueOf(age.raw, age.precision, min === null ? null : String(min), max === null ? null : String(max), "岁"),
        riskCategory: null,
      });
    }

    const count = matchCount(sentence.text);
    if (count !== null) {
      const min = count.min === null ? null : Number(count.min);
      const max = count.max === null ? null : Number(count.max);
      push({
        category: "count",
        statement:
          count.precision === "exact"
            ? `同类行为发生 ${min} 次`
            : `同类行为发生次数表述为「${count.raw}」`,
        originalWording: sentence.text,
        value: valueOf(count.raw, count.precision, min === null ? null : String(min), max === null ? null : String(max), "次"),
        riskCategory: null,
      });
    }

    const quantity = matchQuantity(sentence.text);
    if (quantity !== null) {
      push({
        category: "count",
        statement: `涉案数量表述为「${quantity.raw}」`,
        originalWording: sentence.text,
        value: valueOf(
          quantity.raw,
          "exact",
          String(quantity.value),
          String(quantity.value),
          quantity.unit,
        ),
        riskCategory: null,
      });
    }

    const result = sentence.text.match(RESULT_PATTERN);
    if (result !== null) {
      push({
        category: "result",
        statement: `出现「${result[0]}」等后果表述`,
        originalWording: sentence.text,
        value: valueOf(result[0], "exact", result[0], result[0], null),
        riskCategory: /重伤|流血|昏迷|不省人事|送医|急救/.test(sentence.text) ? "medical" : null,
      });
    }

    const object = sentence.text.match(OBJECT_PATTERN);
    if (object !== null && behavior !== null) {
      push({
        category: "object",
        statement: `行为涉及财物「${object[0]}」`,
        originalWording: sentence.text,
        value: valueOf(object[0], "exact", object[0], object[0], null),
        riskCategory: null,
      });
    }
  }

  // 参与者事实：每位人员生成一条中性代号事实。
  for (const entry of registry.entries()) {
    drafts.push({
      category: "participant",
      statement:
        entry.alias === "报案人"
          ? `报案人（原文表述：${entry.sourceWording}）`
          : `${entry.alias}（原文表述：${entry.sourceWording}）`,
      originalWording: entry.sourceWording,
      value: valueOf(entry.sourceWording, "exact", entry.sourceWording, entry.sourceWording, null),
      participantRefs: [entry.alias],
      eventRef: null,
      behaviorRef: null,
      riskCategory: null,
    });
  }

  const facts = drafts.map((draft, index) => ({
    factId: `fact-${String(index + 1).padStart(3, "0")}`,
    category: draft.category,
    categoryLabel: FACT_CATEGORY_LABELS[draft.category],
    statement: draft.statement,
    originalWording: draft.originalWording,
    value: draft.value,
    eventRefs: draft.eventRef === null ? [] : [draft.eventRef],
    participantRefs: draft.participantRefs,
    behaviorRefs: draft.behaviorRef === null ? [] : [draft.behaviorRef],
    status: "candidate" as const,
    statusLabel: FACT_STATUS_LABELS.candidate,
    sourceRound: 0 as const,
    confirmationMethod: null,
    confirmedAt: null,
    riskCategory: draft.riskCategory,
    excluded: false,
    replacesFactId: null,
    supersededByFactId: null,
  }));

  return {
    facts,
    independentMatters: detectIndependentMatters(eventRecords, hasConjunction),
  };
}
