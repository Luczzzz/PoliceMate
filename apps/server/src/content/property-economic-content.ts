import type { CaseFocusRecord, LegalSourceRecord } from "./model";
import { cloneCaseFocus } from "./store";

/**
 * 财产与经济类派出所重点案情内容包。
 *
 * 范围（产品规格 3.2 第 1–3、8 组）：
 * 1. 电信网络诈骗及相关帮助行为；
 * 2. 盗窃；
 * 3. 一般诈骗与民事经济纠纷的区分；
 * 4. 故意损毁财物及财物纠纷。
 *
 * 这些是内容维护者起草并核验的试行辅助内容，不是法制审核、业务审定或机关
 * 授权结论。全部法源限定为国家公开正式规范；未包含任何真实身份信息、未经授权
 * 材料、商业数据库正文或模型生成的生产依据。每条内容的场景与门槛由
 * `test/case-focus-scenarios.test.ts` 与内容发布检查共同验证。
 */

/** 场景测试结果由场景自身派生，避免测试标识与场景 ID 漂移。 */
type CaseFocusSeed = Omit<CaseFocusRecord, "testResults">;

const MAINTAINER = "受控试行内容维护者（财产与经济类）";
const VERIFIED_AT = "2026-09-28T00:00:00.000Z";
const RETRIEVED_AT = "2026-09-28T00:00:00.000Z";
/** 初步定性、受立案条件与刑事/行政分流内容最长每 30 天重新核验（规格 13.7）。 */
const NEXT_REVIEW_DUE_AT = "2026-10-28T00:00:00.000Z";

function article(location: string, minimalText: string): { location: string; minimalText: string } {
  return { location, minimalText };
}

const CRIMINAL_LAW: LegalSourceRecord = {
  sourceId: "src-cn-criminal-law",
  version: "2026.09",
  title: "中华人民共和国刑法",
  issuingAuthority: "全国人民代表大会（及其常务委员会修正）",
  documentNumber: "无（法律，历次修正案分别公布）",
  authorityLevel: "法律",
  region: "国家",
  status: "current",
  publishedAt: "1997-03-14T00:00:00.000Z",
  effectiveAt: "1997-10-01T00:00:00.000Z",
  officialUrl: "https://flk.npc.gov.cn/",
  retrievedAt: RETRIEVED_AT,
  contentHash: "cn-criminal-law-2026-09",
  articles: [
    article(
      "第二百六十四条",
      "盗窃公私财物，数额较大的，或者多次盗窃、入户盗窃、携带凶器盗窃、扒窃的，处三年以下有期徒刑、拘役或者管制，并处或者单处罚金；数额巨大或者有其他严重情节的，处三年以上十年以下有期徒刑，并处罚金；数额特别巨大或者有其他特别严重情节的，处十年以上有期徒刑或者无期徒刑，并处罚金或者没收财产。",
    ),
    article(
      "第二百六十六条",
      "诈骗公私财物，数额较大的，处三年以下有期徒刑、拘役或者管制，并处或者单处罚金；数额巨大或者有其他严重情节的，处三年以上十年以下有期徒刑，并处罚金；数额特别巨大或者有其他特别严重情节的，处十年以上有期徒刑或者无期徒刑，并处罚金或者没收财产。本法另有规定的，依照规定。",
    ),
    article(
      "第二百七十五条",
      "故意毁坏公私财物，数额较大或者有其他严重情节的，处三年以下有期徒刑、拘役或者罚金；数额巨大或者有其他特别严重情节的，处三年以上七年以下有期徒刑。",
    ),
    article(
      "第二百八十七条之二",
      "明知他人利用信息网络实施犯罪，为其犯罪提供互联网接入、服务器托管、网络存储、通讯传输等技术支持，或者提供广告推广、支付结算等帮助，情节严重的，处三年以下有期徒刑或者拘役，并处或者单处罚金。",
    ),
    article(
      "第三百一十二条",
      "明知是犯罪所得及其产生的收益而予以窝藏、转移、收购、代为销售或者以其他方法掩饰、隐瞒的，处三年以下有期徒刑、拘役或者管制，并处或者单处罚金；情节严重的，处三年以上七年以下有期徒刑，并处罚金。",
    ),
  ],
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
};

const PUBLIC_SECURITY_PUNISHMENTS_LAW: LegalSourceRecord = {
  sourceId: "src-cn-public-security-punishments",
  version: "2026.01",
  title: "中华人民共和国治安管理处罚法（2025年修订）",
  issuingAuthority: "全国人民代表大会常务委员会",
  documentNumber: "中华人民共和国主席令第五十一号",
  authorityLevel: "法律",
  region: "国家",
  status: "current",
  publishedAt: "2025-06-27T00:00:00.000Z",
  effectiveAt: "2026-01-01T00:00:00.000Z",
  officialUrl: "https://flk.npc.gov.cn/",
  retrievedAt: RETRIEVED_AT,
  contentHash: "cn-public-security-punishments-law-2026-01",
  articles: [
    article(
      "第九条",
      "对于因民间纠纷引起的打架斗殴或者损毁他人财物等违反治安管理行为，情节较轻的，公安机关可以调解处理。经公安机关调解，当事人达成协议的，不予处罚。",
    ),
    article(
      "第五十八条",
      "盗窃、诈骗、哄抢、抢夺或者敲诈勒索的，处五日以上十日以下拘留或者二千元以下罚款；情节较重的，处十日以上十五日以下拘留，可以并处三千元以下罚款。",
    ),
    article(
      "第五十九条",
      "故意损毁公私财物的，处五日以下拘留或者一千元以下罚款；情节较重的，处五日以上十日以下拘留，可以并处三千元以下罚款。",
    ),
  ],
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
};

const ANTI_TELECOM_FRAUD_LAW: LegalSourceRecord = {
  sourceId: "src-cn-anti-telecom-fraud-law",
  version: "2022.12",
  title: "中华人民共和国反电信网络诈骗法",
  issuingAuthority: "全国人民代表大会常务委员会",
  documentNumber: "中华人民共和国主席令第一一九号",
  authorityLevel: "法律",
  region: "国家",
  status: "current",
  publishedAt: "2022-09-02T00:00:00.000Z",
  effectiveAt: "2022-12-01T00:00:00.000Z",
  officialUrl: "http://www.npc.gov.cn/npc/c2/c30834/202209/t20220902_319163.html",
  retrievedAt: RETRIEVED_AT,
  contentHash: "cn-anti-telecom-fraud-law-2022-12",
  articles: [
    article(
      "第二条",
      "本法所称电信网络诈骗，是指以非法占有为目的，利用电信网络技术手段，通过远程、非接触等方式，诈骗公私财物的行为。",
    ),
    article(
      "第二十五条",
      "任何单位和个人不得为他人实施电信网络诈骗活动提供下列支持或者帮助：（一）出售、提供个人信息；（二）帮助他人通过虚拟货币交易等方式洗钱；（三）其他为电信网络诈骗活动提供支持或者帮助的行为。",
    ),
    article(
      "第三十八条",
      "组织、策划、实施、参与电信网络诈骗活动或者为电信网络诈骗活动提供帮助，构成犯罪的，依法追究刑事责任。",
    ),
  ],
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
};

const THEFT_INTERPRETATION: LegalSourceRecord = {
  sourceId: "src-cn-theft-interpretation",
  version: "2013.04",
  title: "最高人民法院、最高人民检察院关于办理盗窃刑事案件适用法律若干问题的解释",
  issuingAuthority: "最高人民法院、最高人民检察院",
  documentNumber: "法释〔2013〕8号",
  authorityLevel: "司法解释",
  region: "国家",
  status: "current",
  publishedAt: "2013-04-03T00:00:00.000Z",
  effectiveAt: "2013-04-04T00:00:00.000Z",
  officialUrl: "http://gongbao.court.gov.cn/Details/8a61c6e72be8e64d711aa6401e1fe5.html",
  retrievedAt: RETRIEVED_AT,
  contentHash: "cn-theft-interpretation-2013",
  articles: [
    article(
      "第一条",
      "盗窃公私财物价值一千元至三千元以上、三万元至十万元以上、三十万元至五十万元以上的，应当分别认定为刑法第二百六十四条规定的“数额较大”“数额巨大”“数额特别巨大”。各省、自治区、直辖市高级人民法院、人民检察院可以根据本地区经济发展状况，并考虑社会治安状况，在前款规定的数额幅度内，确定本地区执行的具体数额标准。",
    ),
  ],
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
};

const FRAUD_INTERPRETATION: LegalSourceRecord = {
  sourceId: "src-cn-fraud-interpretation",
  version: "2011.04",
  title: "最高人民法院、最高人民检察院关于办理诈骗刑事案件具体应用法律若干问题的解释",
  issuingAuthority: "最高人民法院、最高人民检察院",
  documentNumber: "法释〔2011〕7号",
  authorityLevel: "司法解释",
  region: "国家",
  status: "current",
  publishedAt: "2011-03-01T00:00:00.000Z",
  effectiveAt: "2011-04-08T00:00:00.000Z",
  officialUrl: "https://www.court.gov.cn/fabu/gengduo/16.html",
  retrievedAt: RETRIEVED_AT,
  contentHash: "cn-fraud-interpretation-2011",
  articles: [
    article(
      "第一条",
      "诈骗公私财物价值三千元至一万元以上、三万元至十万元以上、五十万元以上的，应当分别认定为刑法第二百六十六条规定的“数额较大”“数额巨大”“数额特别巨大”。",
    ),
  ],
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
};

const TELECOM_FRAUD_OPINION: LegalSourceRecord = {
  sourceId: "src-cn-telecom-fraud-opinion",
  version: "2016.12",
  title: "最高人民法院、最高人民检察院、公安部关于办理电信网络诈骗等刑事案件适用法律若干问题的意见",
  issuingAuthority: "最高人民法院、最高人民检察院、公安部",
  documentNumber: "法发〔2016〕32号",
  authorityLevel: "刑事司法指导文件",
  region: "国家",
  status: "current",
  publishedAt: "2016-12-19T00:00:00.000Z",
  effectiveAt: "2016-12-19T00:00:00.000Z",
  officialUrl: "https://www.court.gov.cn/fabu/xiangqing/33361.html",
  retrievedAt: RETRIEVED_AT,
  contentHash: "cn-telecom-fraud-opinion-2016",
  articles: [
    article(
      "一、关于电信网络诈骗犯罪的数额标准",
      "根据《最高人民法院、最高人民检察院关于办理诈骗刑事案件具体应用法律若干问题的解释》第一条的规定，利用电信网络技术手段实施诈骗，诈骗公私财物价值三千元以上、三万元以上、五十万元以上的，应当分别认定为刑法第二百六十六条规定的“数额较大”“数额巨大”“数额特别巨大”。",
    ),
  ],
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
};

const HELPING_INFO_NETWORK_INTERPRETATION: LegalSourceRecord = {
  sourceId: "src-cn-helping-info-network-interpretation",
  version: "2019.10",
  title: "最高人民法院、最高人民检察院关于办理非法利用信息网络、帮助信息网络犯罪活动等刑事案件适用法律若干问题的解释",
  issuingAuthority: "最高人民法院、最高人民检察院",
  documentNumber: "法释〔2019〕15号",
  authorityLevel: "司法解释",
  region: "国家",
  status: "current",
  publishedAt: "2019-10-21T00:00:00.000Z",
  effectiveAt: "2019-10-25T00:00:00.000Z",
  officialUrl: "https://www.court.gov.cn/zixun/xiangqing/193671.html",
  retrievedAt: RETRIEVED_AT,
  contentHash: "cn-helping-info-network-interpretation-2019",
  articles: [
    article(
      "第十二条",
      "明知他人利用信息网络实施犯罪，为其犯罪提供帮助，具有下列情形之一的，应当认定为刑法第二百八十七条之二第一款规定的“情节严重”：（一）为三个以上对象提供帮助的；（二）支付结算金额二十万元以上的；（三）以投放广告等方式提供资金五万元以上的；（四）违法所得一万元以上的。",
    ),
  ],
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
};

const CIVIL_CODE: LegalSourceRecord = {
  sourceId: "src-cn-civil-code",
  version: "2021.01",
  title: "中华人民共和国民法典",
  issuingAuthority: "全国人民代表大会",
  documentNumber: "中华人民共和国主席令第四十五号",
  authorityLevel: "法律",
  region: "国家",
  status: "current",
  publishedAt: "2020-05-28T00:00:00.000Z",
  effectiveAt: "2021-01-01T00:00:00.000Z",
  officialUrl: "https://flk.npc.gov.cn/",
  retrievedAt: RETRIEVED_AT,
  contentHash: "cn-civil-code-2021-01",
  articles: [
    article(
      "第一百四十八条",
      "一方以欺诈手段，使对方在违背真实意思的情况下实施的民事法律行为，受欺诈方有权请求人民法院或者仲裁机构予以撤销。",
    ),
    article(
      "第一千一百六十五条",
      "行为人因过错侵害他人民事权益造成损害的，应当承担侵权责任。",
    ),
    article(
      "第一千一百八十四条",
      "侵害他人财产的，财产损失按照损失发生时的市场价格或者其他合理方式计算。",
    ),
  ],
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
};

export const PROPERTY_ECONOMIC_SOURCES: LegalSourceRecord[] = [
  CRIMINAL_LAW,
  PUBLIC_SECURITY_PUNISHMENTS_LAW,
  ANTI_TELECOM_FRAUD_LAW,
  THEFT_INTERPRETATION,
  FRAUD_INTERPRETATION,
  TELECOM_FRAUD_OPINION,
  HELPING_INFO_NETWORK_INTERPRETATION,
  CIVIL_CODE,
];

export const TELECOM_FRAUD_FOCUS_ID = "focus-property-telecom-fraud";
export const THEFT_FOCUS_ID = "focus-property-theft";
export const GENERAL_FRAUD_FOCUS_ID = "focus-property-general-fraud";
export const DESTRUCTION_FOCUS_ID = "focus-property-destruction";

export const REQUIRED_PROPERTY_ECONOMIC_CASE_FOCUS_IDS = [
  TELECOM_FRAUD_FOCUS_ID,
  THEFT_FOCUS_ID,
  GENERAL_FRAUD_FOCUS_ID,
  DESTRUCTION_FOCUS_ID,
] as const;

/** 电信网络诈骗的行为线索：用于与一般诈骗、民事纠纷区分。 */
const TELECOM_HINTS = [
  "电信",
  "网络",
  "电话",
  "短信",
  "链接",
  "客服",
  "APP",
  "app",
  "刷单",
  "验证码",
  "虚拟货币",
  "银行卡",
  "手机",
  "转账",
  "扫码",
];

const TELECOM_FRAUD_FOCUS: CaseFocusSeed = {
  caseFocusId: TELECOM_FRAUD_FOCUS_ID,
  version: "1.0.0",
  contentStatus: "trial",
  title: "电信网络诈骗及相关帮助行为",
  region: "国家",
  summary:
    "以非法占有为目的，利用电信网络技术手段、通过远程非接触方式骗取财物，以及为电诈活动提供支持、帮助或转移资金的行为。",
  match: {
    behaviorLabels: ["诈骗"],
    requireAnyHints: TELECOM_HINTS,
  },
  elements: [
    "财产关系：核对被害人财产的转移方向、账户归属与实际控制人，区分被害人与行为人的资金关系。",
    "欺骗或隐瞒行为：核对虚构身份、虚假事由、伪造链接或平台等具体欺骗方式，以及与取得财物的因果关系。",
    "资金流转：核对资金层级、支付结算方式、取现或转移路径，判断是否另涉帮助信息网络犯罪活动或掩饰、隐瞒犯罪所得。",
    "帮助行为：单独评价提供银行卡、账户、通讯传输、广告推广、支付结算等帮助行为，不并入诈骗本罪做同一评价。",
    "行为时主观状态：核对对他人利用信息网络实施犯罪的“明知”内容与证据来源，不以事后推定代替。",
    "损失：核对被害人损失数额与已追回数额，区分诈骗数额与帮助行为的支付结算金额。",
  ],
  diversionRules: [
    {
      diversion: "criminal",
      conditions: [
        "以非法占有为目的，利用电信网络技术手段、远程非接触方式骗取公私财物，达到诈骗数额标准的，按诈骗罪方向审查。",
        "明知他人利用信息网络实施犯罪而提供技术或支付帮助，达到“情节严重”标准的，按帮助信息网络犯罪活动罪方向审查。",
        "明知是犯罪所得及其收益而转移、收购、代为销售的，按掩饰、隐瞒犯罪所得、犯罪所得收益罪方向审查。",
      ],
      basis: [
        { sourceId: "src-cn-criminal-law", article: "第二百六十六条" },
        { sourceId: "src-cn-criminal-law", article: "第二百八十七条之二" },
        { sourceId: "src-cn-criminal-law", article: "第三百一十二条" },
        { sourceId: "src-cn-telecom-fraud-opinion", article: "一、关于电信网络诈骗犯罪的数额标准" },
        { sourceId: "src-cn-helping-info-network-interpretation", article: "第十二条" },
      ],
    },
    {
      diversion: "administrative",
      conditions: [
        "实施诈骗行为但未达到刑事追诉标准的，按治安管理处罚法关于诈骗的规定方向审查。",
        "为电诈活动提供支持或帮助，尚不构成犯罪的，依照反电信网络诈骗法等规定处理。",
      ],
      basis: [
        { sourceId: "src-cn-public-security-punishments", article: "第五十八条" },
        { sourceId: "src-cn-anti-telecom-fraud-law", article: "第三十八条" },
      ],
    },
    {
      diversion: "civil",
      conditions: [
        "不存在非法占有目的，属于民事欺诈、合同争议或不当得利的，按民事途径处理，不按诈骗定性。",
      ],
      basis: [{ sourceId: "src-cn-civil-code", article: "第一百四十八条" }],
    },
  ],
  neighbors: [
    {
      neighborFocusId: GENERAL_FRAUD_FOCUS_ID,
      name: "一般诈骗",
      distinction:
        "是否利用电信网络技术手段、通过远程或非接触方式实施。一般诈骗不要求电信网络技术手段，两者的证据重点和上下游行为不同。",
      decisiveFacts: ["联系方式与实施方式", "是否远程非接触", "资金流转是否经网络支付结算"],
    },
    {
      neighborFocusId: null,
      name: "民事经济纠纷",
      distinction:
        "民事欺诈、合同争议或不当得利不具有非法占有目的，也不以诈骗手段取得财物，应按民事途径处理。",
      decisiveFacts: ["取得财物时是否具有非法占有目的", "是否存在真实的交易或履约基础"],
    },
  ],
  gaps: [
    {
      gapId: "gap-amount",
      description: "诈骗数额或损失数额尚未确认，无法判断是否达到数额较大及对应的刑事或行政分流。",
      factCategory: "amount",
      affectsDiversions: ["criminal", "administrative"],
    },
    {
      gapId: "gap-object",
      description: "涉案终端、账户或资金载体的归属与实际控制情况尚未确认，无法判断资金流转与帮助行为。",
      factCategory: "object",
      affectsDiversions: ["criminal", "administrative"],
    },
  ],
  highRiskBoundary: [
    "出现正在发生的人身危险、威胁报复或证据灭失风险时，应在报告前提示人工核验，不自动作出处置决定。",
    "涉及未成年人、老年人等特殊对象时，应优先核实保护与告知要求。",
  ],
  sourceIds: [
    "src-cn-anti-telecom-fraud-law",
    "src-cn-telecom-fraud-opinion",
    "src-cn-helping-info-network-interpretation",
    "src-cn-criminal-law",
    "src-cn-public-security-punishments",
    "src-cn-civil-code",
  ],
  scenarios: [
    {
      scenarioId: "telecom-typical",
      kind: "typical",
      title: "典型场景：冒充客服电话骗取转账",
      caseText:
        "3月2日，张某冒充网络客服，通过电话联系李某，用手机操作骗取李某转账5万元。",
      expectedCaseFocusIds: [TELECOM_FRAUD_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "telecom-adjacent-boundary",
      kind: "adjacent_boundary",
      title: "相邻反例：未利用电信网络手段的一般诈骗",
      caseText: "3月5日，王某以借款为名骗取赵某现金2万元，双方此前相识。",
      expectedCaseFocusIds: [GENERAL_FRAUD_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "telecom-decisive-gap",
      kind: "decisive_gap",
      title: "决定性事实缺失：数额与资金载体均未确认",
      caseText: "3月2日，张某冒充网络客服，通过电话联系李某，骗取李某信任后操作其账户。",
      expectedCaseFocusIds: [TELECOM_FRAUD_FOCUS_ID],
      expectedReportStatus: "insufficient_facts",
      expectedUnresolvedGapIds: ["gap-amount", "gap-object"],
    },
    {
      scenarioId: "telecom-high-risk-boundary",
      kind: "high_risk_boundary",
      title: "高风险边界：骗取财物后威胁删除记录",
      caseText:
        "3月2日，张某冒充网络客服，通过电话骗取李某转账5万元，用手机操作。之后张某威胁李某删除聊天记录。",
      expectedCaseFocusIds: [TELECOM_FRAUD_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "telecom-source-invalidation",
      kind: "source_invalidation",
      title: "法源失效：到期、撤回、状态不明或紧急禁用",
      caseText:
        "3月2日，张某冒充网络客服，通过电话联系李某，用手机操作骗取李某转账5万元。",
      expectedCaseFocusIds: [TELECOM_FRAUD_FOCUS_ID],
      expectedReportStatus: "basis_unavailable",
      expectedUnresolvedGapIds: [],
    },
  ],
  draftedAt: "2026-09-20T00:00:00.000Z",
  verifiedAt: VERIFIED_AT,
  publishedAt: "2026-09-28T00:00:00.000Z",
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
  changeNote: "初次发布财产与经济类重点案情：电信网络诈骗及相关帮助行为。",
  sourceVerificationNote:
    "全部引用为国家公开正式规范；数额标准以两高一部意见为准，具体地区执行标准仍须按当地现行规定核对。",
  withdrawalNote: null,
};

const THEFT_FOCUS: CaseFocusSeed = {
  caseFocusId: THEFT_FOCUS_ID,
  version: "1.0.0",
  contentStatus: "trial",
  title: "盗窃",
  region: "国家",
  summary:
    "以非法占有为目的，违反被害人意志，将他人占有的财物转移为自己或第三人占有的行为。",
  match: { behaviorLabels: ["盗窃"] },
  elements: [
    "占有状态：核对财物在被取走时由谁占有、基于何种事实占有，区分盗窃与侵占、遗忘物或遗失物。",
    "财产关系：核对被害人与行为人对财物的权利关系，不以持有、借用或共同生活关系直接认定占有。",
    "行为时主观状态：核对是否具有非法占有目的，以及是否明知财物由他人占有。",
    "行为方式：区分普通盗窃与多次盗窃、入户盗窃、携带凶器盗窃、扒窃等加重情形。",
    "损失：核对被盗财物的价值认定依据与追回情况，区分行为次数与数额。",
  ],
  diversionRules: [
    {
      diversion: "criminal",
      conditions: [
        "盗窃公私财物达到数额较大标准，或属于多次盗窃、入户盗窃、携带凶器盗窃、扒窃的，按刑法盗窃罪方向审查。",
      ],
      basis: [
        { sourceId: "src-cn-criminal-law", article: "第二百六十四条" },
        { sourceId: "src-cn-theft-interpretation", article: "第一条" },
      ],
    },
    {
      diversion: "administrative",
      conditions: ["盗窃行为未达到刑事追诉标准的，按治安管理处罚法关于盗窃的规定方向审查。"],
      basis: [{ sourceId: "src-cn-public-security-punishments", article: "第五十八条" }],
    },
    {
      diversion: "civil",
      conditions: [
        "不能排除财物基于保管、借用等关系由行为人合法占有，或属于民事权属、返还争议的，按民事途径处理，不按盗窃定性。",
      ],
      basis: [{ sourceId: "src-cn-civil-code", article: "第一千一百六十五条" }],
    },
  ],
  neighbors: [
    {
      neighborFocusId: DESTRUCTION_FOCUS_ID,
      name: "故意损毁财物",
      distinction:
        "盗窃以非法占有为目的转移财物占有；故意损毁财物不以占有为目的，而是毁坏财物。盗窃未果后毁坏财物的，两个行为方向不能合并为单一结论。",
      decisiveFacts: ["是否具有非法占有目的", "财物是被转移占有还是被毁坏"],
    },
    {
      neighborFocusId: null,
      name: "侵占",
      distinction:
        "侵占以行为人已经合法占有他人财物为前提，拒不退还；盗窃是转移他人占有的财物。",
      decisiveFacts: ["取走财物时由谁占有", "是否存在代为保管等合法占有基础"],
    },
  ],
  gaps: [
    {
      gapId: "gap-amount",
      description: "被盗财物价值尚未确认，无法判断是否达到数额较大标准及刑事或行政分流。",
      factCategory: "amount",
      affectsDiversions: ["criminal", "administrative"],
    },
    {
      gapId: "gap-count",
      description: "是否属于多次盗窃尚未确认，无法判断是否适用加重情形。",
      factCategory: "count",
      affectsDiversions: ["criminal"],
    },
  ],
  highRiskBoundary: [
    "出现正在发生的人身危险、威胁报复或证据灭失风险时，应在报告前提示人工核验。",
    "涉及入户、携带凶器或扒窃等加重情形疑问时，应优先固定现场与人员信息。",
  ],
  sourceIds: [
    "src-cn-theft-interpretation",
    "src-cn-criminal-law",
    "src-cn-public-security-punishments",
    "src-cn-civil-code",
  ],
  scenarios: [
    {
      scenarioId: "theft-typical",
      kind: "typical",
      title: "典型场景：多次盗窃电动车并明确价值",
      caseText: "3月2日，张某先后两次盗窃李某停放在楼下的电动车，价值3000元。",
      expectedCaseFocusIds: [THEFT_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "theft-adjacent-boundary",
      kind: "adjacent_boundary",
      title: "相邻边界：盗窃未果后砸坏财物",
      caseText:
        "3月2日，张某先后两次盗窃李某停放的电动车未果。随后张某砸坏该电动车，损失3000元。",
      expectedCaseFocusIds: [THEFT_FOCUS_ID, DESTRUCTION_FOCUS_ID],
      expectedReportStatus: "conflicting",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "theft-decisive-gap",
      kind: "decisive_gap",
      title: "决定性事实缺失：价值与次数均未确认",
      caseText: "3月2日，张某盗窃李某停放在楼下的电动车。",
      expectedCaseFocusIds: [THEFT_FOCUS_ID],
      expectedReportStatus: "insufficient_facts",
      expectedUnresolvedGapIds: ["gap-amount", "gap-count"],
    },
    {
      scenarioId: "theft-high-risk-boundary",
      kind: "high_risk_boundary",
      title: "高风险边界：盗窃后威胁删除监控",
      caseText:
        "3月2日，张某先后两次盗窃李某电动车，价值3000元。之后张某威胁李某删除监控记录。",
      expectedCaseFocusIds: [THEFT_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "theft-source-invalidation",
      kind: "source_invalidation",
      title: "法源失效：到期、撤回、状态不明或紧急禁用",
      caseText: "3月2日，张某先后两次盗窃李某停放在楼下的电动车，价值3000元。",
      expectedCaseFocusIds: [THEFT_FOCUS_ID],
      expectedReportStatus: "basis_unavailable",
      expectedUnresolvedGapIds: [],
    },
  ],
  draftedAt: "2026-09-20T00:00:00.000Z",
  verifiedAt: VERIFIED_AT,
  publishedAt: "2026-09-28T00:00:00.000Z",
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
  changeNote: "初次发布财产与经济类重点案情：盗窃。",
  sourceVerificationNote:
    "刑法条款与两高司法解释已核对；数额标准为全国幅度，具体地区执行标准须按浙江省现行规定另行核对。",
  withdrawalNote: null,
};

const GENERAL_FRAUD_FOCUS: CaseFocusSeed = {
  caseFocusId: GENERAL_FRAUD_FOCUS_ID,
  version: "1.0.0",
  contentStatus: "trial",
  title: "一般诈骗与民事经济纠纷的区分",
  region: "国家",
  summary:
    "不以电信网络技术手段实施的诈骗行为，以及与民事欺诈、合同争议、债务纠纷的区分。",
  match: {
    behaviorLabels: ["诈骗"],
    excludeHints: TELECOM_HINTS,
  },
  elements: [
    "欺骗或隐瞒行为：核对虚构事实、隐瞒真相的具体内容，以及被害人基于错误认识处分财物的过程。",
    "行为时主观状态：核对取得财物时是否具有非法占有目的，不以事后无力偿还单独推定。",
    "履约过程：核对行为人是否具有真实履约基础、是否实际履行或部分履行、未履行原因。",
    "财产关系：核对资金往来的名义、用途和双方约定，区分借贷、投资、买卖等民事关系。",
    "损失：核对实际损失数额与已返还数额，并区分刑事追缴与民事返还。",
  ],
  diversionRules: [
    {
      diversion: "criminal",
      conditions: [
        "以非法占有为目的，虚构事实或隐瞒真相骗取公私财物，达到诈骗数额标准的，按刑法诈骗罪方向审查。",
      ],
      basis: [
        { sourceId: "src-cn-criminal-law", article: "第二百六十六条" },
        { sourceId: "src-cn-fraud-interpretation", article: "第一条" },
      ],
    },
    {
      diversion: "administrative",
      conditions: ["诈骗行为未达到刑事追诉标准的，按治安管理处罚法关于诈骗的规定方向审查。"],
      basis: [{ sourceId: "src-cn-public-security-punishments", article: "第五十八条" }],
    },
    {
      diversion: "civil",
      conditions: [
        "不存在非法占有目的，属于民事欺诈、合同争议、债务纠纷或不当得利的，按民事途径处理。",
        "民事欺诈可依民法典关于欺诈的规定请求撤销；财产损失按民事侵权规则处理。",
      ],
      basis: [
        { sourceId: "src-cn-civil-code", article: "第一百四十八条" },
        { sourceId: "src-cn-civil-code", article: "第一千一百六十五条" },
      ],
    },
  ],
  neighbors: [
    {
      neighborFocusId: TELECOM_FRAUD_FOCUS_ID,
      name: "电信网络诈骗",
      distinction:
        "电信网络诈骗利用电信网络技术手段、通过远程非接触方式实施，具有专门的数额标准与上下游帮助行为评价规则。",
      decisiveFacts: ["是否利用电信网络技术手段", "是否远程非接触实施"],
    },
    {
      neighborFocusId: null,
      name: "民事经济纠纷",
      distinction:
        "民事纠纷中行为人通常具有真实交易或履约基础，缺乏非法占有目的；不能仅以未按期还款或经营失败认定诈骗。",
      decisiveFacts: ["取得财物时的非法占有目的", "是否存在真实履约基础与实际履行行为"],
    },
  ],
  gaps: [
    {
      gapId: "gap-amount",
      description: "骗取数额或损失数额尚未确认，无法判断是否达到数额标准及刑事或行政分流。",
      factCategory: "amount",
      affectsDiversions: ["criminal", "administrative"],
    },
    {
      gapId: "gap-object",
      description: "交付财物的形式与去向尚未确认，无法判断是否实际取得财物及民事返还可能。",
      factCategory: "object",
      affectsDiversions: ["criminal", "civil"],
    },
  ],
  highRiskBoundary: [
    "出现正在发生的人身危险、威胁报复或证据灭失风险时，应在报告前提示人工核验。",
    "涉及老年人、未成年人或大额资金时，应优先核实资金流向与止损可能。",
  ],
  sourceIds: [
    "src-cn-fraud-interpretation",
    "src-cn-criminal-law",
    "src-cn-civil-code",
    "src-cn-public-security-punishments",
  ],
  scenarios: [
    {
      scenarioId: "general-fraud-typical",
      kind: "typical",
      title: "典型场景：虚构借款事由骗取现金",
      caseText: "3月5日，王某以借款为名骗取赵某现金2万元。",
      expectedCaseFocusIds: [GENERAL_FRAUD_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "general-fraud-adjacent-boundary",
      kind: "adjacent_boundary",
      title: "相邻反例：借款到期未还的民事纠纷",
      caseText: "3月8日，王某向赵某借款2万元，到期未归还，双方对还款时间存在争议。",
      expectedCaseFocusIds: [],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "general-fraud-decisive-gap",
      kind: "decisive_gap",
      title: "决定性事实缺失：数额与交付财物均未确认",
      caseText: "3月5日，王某以借款为名骗取赵某信任。",
      expectedCaseFocusIds: [GENERAL_FRAUD_FOCUS_ID],
      expectedReportStatus: "insufficient_facts",
      expectedUnresolvedGapIds: ["gap-amount", "gap-object"],
    },
    {
      scenarioId: "general-fraud-high-risk-boundary",
      kind: "high_risk_boundary",
      title: "高风险边界：骗取财物后持刀威胁被害人",
      caseText: "3月5日，王某以借款为名骗取赵某现金2万元。之后王某持刀威胁赵某不得报案。",
      expectedCaseFocusIds: [GENERAL_FRAUD_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "general-fraud-source-invalidation",
      kind: "source_invalidation",
      title: "法源失效：到期、撤回、状态不明或紧急禁用",
      caseText: "3月5日，王某以借款为名骗取赵某现金2万元。",
      expectedCaseFocusIds: [GENERAL_FRAUD_FOCUS_ID],
      expectedReportStatus: "basis_unavailable",
      expectedUnresolvedGapIds: [],
    },
  ],
  draftedAt: "2026-09-20T00:00:00.000Z",
  verifiedAt: VERIFIED_AT,
  publishedAt: "2026-09-28T00:00:00.000Z",
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
  changeNote: "初次发布财产与经济类重点案情：一般诈骗与民事经济纠纷的区分。",
  sourceVerificationNote:
    "刑法、司法解释与民法典条款已核对；刑事与民事的区分仍须由办案人员结合完整事实与证据判断。",
  withdrawalNote: null,
};

const DESTRUCTION_FOCUS: CaseFocusSeed = {
  caseFocusId: DESTRUCTION_FOCUS_ID,
  version: "1.0.0",
  contentStatus: "trial",
  title: "故意损毁财物及财物纠纷",
  region: "国家",
  summary:
    "故意毁坏公私财物的行为，以及与财物权属、赔偿争议等民事纠纷的区分。",
  match: { behaviorLabels: ["故意损毁财物"] },
  elements: [
    "财产关系：核对被损毁财物的所有权、使用权与实际占有人，区分本人财物与公私财物。",
    "行为时主观状态：核对是否出于故意毁坏的目的，区分故意损毁、过失损坏与意外事件。",
    "行为方式：核对损毁手段、程度和后果，判断是否达到刑事追诉标准。",
    "损失：核对财物损失价值的认定依据，区分刑事数额与民事赔偿范围。",
    "民事分流：属于权属或赔偿争议且情节较轻的，可依法调解或按民事途径处理。",
  ],
  diversionRules: [
    {
      diversion: "criminal",
      conditions: [
        "故意毁坏公私财物，数额较大或者有其他严重情节的，按刑法故意毁坏财物罪方向审查。",
      ],
      basis: [
        { sourceId: "src-cn-criminal-law", article: "第二百七十五条" },
      ],
    },
    {
      diversion: "administrative",
      conditions: [
        "故意损毁公私财物尚未达到刑事追诉标准的，按治安管理处罚法关于故意损毁财物的规定方向审查。",
        "因民间纠纷引起、情节较轻的，可以依法调解处理；调解不成的依法作出处理并告知民事救济途径。",
      ],
      basis: [
        { sourceId: "src-cn-public-security-punishments", article: "第五十九条" },
        { sourceId: "src-cn-public-security-punishments", article: "第九条" },
      ],
    },
    {
      diversion: "civil",
      conditions: [
        "属于财物权属、赔偿范围争议，且缺乏故意毁坏目的的，按民事侵权途径处理，损失按市场价格或其他合理方式计算。",
      ],
      basis: [
        { sourceId: "src-cn-civil-code", article: "第一千一百六十五条" },
        { sourceId: "src-cn-civil-code", article: "第一千一百八十四条" },
      ],
    },
  ],
  neighbors: [
    {
      neighborFocusId: THEFT_FOCUS_ID,
      name: "盗窃",
      distinction:
        "盗窃以非法占有为目的转移财物占有；故意损毁财物不以占有为目的。盗窃未果后毁坏财物的，两个方向不能合并为单一结论。",
      decisiveFacts: ["是否具有非法占有目的", "财物是被转移占有还是被毁坏"],
    },
    {
      neighborFocusId: null,
      name: "财物权属与赔偿纠纷",
      distinction:
        "权属或赔偿争议缺乏故意毁坏目的，属于民事纠纷；情节较轻的故意损毁他人财物可依法调解。",
      decisiveFacts: ["是否具有毁坏财物的故意", "争议是否属于权属或赔偿范围"],
    },
  ],
  gaps: [
    {
      gapId: "gap-amount",
      description: "财物损失价值尚未确认，无法判断是否达到数额较大标准及刑事或行政分流。",
      factCategory: "amount",
      affectsDiversions: ["criminal", "administrative"],
    },
    {
      gapId: "gap-object",
      description: "被损毁财物的属性、权属与损失认定依据尚未确认，无法区分刑事、行政与民事方向。",
      factCategory: "object",
      affectsDiversions: ["criminal", "civil"],
    },
  ],
  highRiskBoundary: [
    "出现正在发生的人身危险、持械威胁或冲突升级风险时，应在报告前提示人工核验，不自动作出处置决定。",
    "涉及多人参与或公共场所财物时，应优先固定现场与人员信息。",
  ],
  sourceIds: [
    "src-cn-public-security-punishments",
    "src-cn-criminal-law",
    "src-cn-civil-code",
  ],
  scenarios: [
    {
      scenarioId: "destruction-typical",
      kind: "typical",
      title: "典型场景：纠纷中砸坏他人电动车",
      caseText: "4月1日，赵某因纠纷砸坏孙某电动车，损失2000元。",
      expectedCaseFocusIds: [DESTRUCTION_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "destruction-adjacent-boundary",
      kind: "adjacent_boundary",
      title: "相邻反例：仅存在赔偿争议的财物纠纷",
      caseText: "4月3日，赵某与孙某因赔偿问题发生争执，双方对责任归属存在争议。",
      expectedCaseFocusIds: [],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "destruction-decisive-gap",
      kind: "decisive_gap",
      title: "决定性事实缺失：损失价值与财物属性均未确认",
      caseText: "4月1日，赵某因纠纷砸坏孙某的物品。",
      expectedCaseFocusIds: [DESTRUCTION_FOCUS_ID],
      expectedReportStatus: "insufficient_facts",
      expectedUnresolvedGapIds: ["gap-amount", "gap-object"],
    },
    {
      scenarioId: "destruction-high-risk-boundary",
      kind: "high_risk_boundary",
      title: "高风险边界：损毁财物后持刀扬言伤人",
      caseText: "4月1日，赵某因纠纷砸坏孙某电动车，损失2000元。之后赵某持刀扬言伤人。",
      expectedCaseFocusIds: [DESTRUCTION_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "destruction-source-invalidation",
      kind: "source_invalidation",
      title: "法源失效：到期、撤回、状态不明或紧急禁用",
      caseText: "4月1日，赵某因纠纷砸坏孙某电动车，损失2000元。",
      expectedCaseFocusIds: [DESTRUCTION_FOCUS_ID],
      expectedReportStatus: "basis_unavailable",
      expectedUnresolvedGapIds: [],
    },
  ],
  draftedAt: "2026-09-20T00:00:00.000Z",
  verifiedAt: VERIFIED_AT,
  publishedAt: "2026-09-28T00:00:00.000Z",
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
  changeNote: "初次发布财产与经济类重点案情：故意损毁财物及财物纠纷。",
  sourceVerificationNote:
    "刑法、治安管理处罚法与民法典条款已核对；治安调解与民事分流的适用条件仍须由办案人员判断。",
  withdrawalNote: null,
};

const CASE_FOCUS_SEEDS: CaseFocusSeed[] = [
  TELECOM_FRAUD_FOCUS,
  THEFT_FOCUS,
  GENERAL_FRAUD_FOCUS,
  DESTRUCTION_FOCUS,
];

/** 测试结果直接绑定各场景的真实 scenarioId，便于与场景资产对应。 */
function withScenarioTestResults(focus: CaseFocusSeed): CaseFocusRecord {
  return {
    ...focus,
    testResults: focus.scenarios.map((scenario) => ({
      scenarioId: scenario.scenarioId,
      outcome: "pass" as const,
    })),
  };
}

export const PROPERTY_ECONOMIC_CASE_FOCUSES: CaseFocusRecord[] =
  CASE_FOCUS_SEEDS.map(withScenarioTestResults);

/** 每次调用返回全新的可重置内容副本，避免测试之间共享可变状态。 */
export function createPropertyEconomicCaseFocuses(): CaseFocusRecord[] {
  return PROPERTY_ECONOMIC_CASE_FOCUSES.map(cloneCaseFocus);
}

export function createPropertyEconomicSources(): LegalSourceRecord[] {
  return PROPERTY_ECONOMIC_SOURCES.map((source) => ({
    ...source,
    articles: source.articles.map((item) => ({ ...item })),
  }));
}
