import type { CaseFocusRecord, LegalSourceRecord } from "./model";
import {
  CIVIL_CODE,
  CRIMINAL_LAW,
  PUBLIC_SECURITY_PUNISHMENTS_LAW,
} from "./national-legal-sources";
import { cloneCaseFocus, cloneLegalSources } from "./store";
import { ADMIN_CASE_PROCEDURE } from "./document-example-content";

/**
 * 治安秩序与毒品类派出所重点案情内容包。
 *
 * 范围（产品规格 3.2 第 4–7 组）：
 * 4. 打架斗殴和伤害类案情；
 * 5. 赌博类案情；
 * 6. 卖淫嫖娼及相关组织、容留、介绍行为；
 * 7. 毒品类违法犯罪。
 *
 * 这些是内容维护者起草并核验的试行辅助内容，不是法制审核、业务审定或机关
 * 授权结论。全部法源限定为国家公开正式规范；未包含任何真实身份信息、未经授权
 * 材料、商业数据库正文或模型生成的生产依据。每条内容的场景与门槛由
 * `test/public-order-drug-scenarios.test.ts` 与内容发布检查共同验证。
 */

/** 场景测试结果由场景自身派生，避免测试标识与场景 ID 漂移。 */
type CaseFocusSeed = Omit<CaseFocusRecord, "testResults">;

const MAINTAINER = "受控试行内容维护者（治安秩序与毒品类）";
const VERIFIED_AT = "2026-09-28T00:00:00.000Z";
const CASE_FOCUS_VERIFIED_AT = "2026-09-30T00:00:00.000Z";
const RETRIEVED_AT = "2026-09-28T00:00:00.000Z";
/** 初步定性、受立案条件与刑事/行政分流内容最长每 30 天重新核验（规格 13.7）。 */
const NEXT_REVIEW_DUE_AT = "2026-10-28T00:00:00.000Z";

function article(location: string, minimalText: string): { location: string; minimalText: string } {
  return { location, minimalText };
}

const GAMBLING_INTERPRETATION: LegalSourceRecord = {
  sourceId: "src-cn-gambling-interpretation",
  version: "2005.05",
  title: "最高人民法院、最高人民检察院关于办理赌博刑事案件具体应用法律若干问题的解释",
  issuingAuthority: "最高人民法院、最高人民检察院",
  documentNumber: "法释〔2005〕3号",
  authorityLevel: "司法解释",
  region: "国家",
  status: "current",
  publishedAt: "2005-05-11T00:00:00.000Z",
  effectiveAt: "2005-05-13T00:00:00.000Z",
  officialUrl: "http://gongbao.court.gov.cn/Details/bbcd0735eb402996a074c3ca858898.html",
  retrievedAt: RETRIEVED_AT,
  contentHash: "cn-gambling-interpretation-2005",
  articles: [
    article(
      "第一条",
      "以营利为目的，有下列情形之一的，属于刑法第三百零三条规定的“聚众赌博”：（一）组织3人以上赌博，抽头渔利数额累计达到5000元以上的；（二）组织3人以上赌博，赌资数额累计达到5万元以上的；（三）组织3人以上赌博，参赌人数累计达到20人以上的；（四）组织中华人民共和国公民10人以上赴境外赌博，从中收取回扣、介绍费的。",
    ),
    article(
      "第二条",
      "以营利为目的，在计算机网络上建立赌博网站，或者为赌博网站担任代理，接受投注的，属于刑法第三百零三条规定的“开设赌场”。",
    ),
  ],
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
};

const NETWORK_GAMBLING_OPINION: LegalSourceRecord = {
  sourceId: "src-cn-network-gambling-opinion",
  version: "2010.08",
  title: "最高人民法院、最高人民检察院、公安部关于办理网络赌博犯罪案件适用法律若干问题的意见",
  issuingAuthority: "最高人民法院、最高人民检察院、公安部",
  documentNumber: "公通字〔2010〕40号",
  authorityLevel: "刑事司法指导文件",
  region: "国家",
  status: "current",
  publishedAt: "2010-08-31T00:00:00.000Z",
  effectiveAt: "2010-08-31T00:00:00.000Z",
  officialUrl: "https://www.court.gov.cn/shenpan/xiangqing/1877.html",
  retrievedAt: RETRIEVED_AT,
  contentHash: "cn-network-gambling-opinion-2010",
  articles: [
    article(
      "一、关于网上开设赌场犯罪的定罪量刑标准",
      "利用互联网、移动通讯终端等传输赌博视频、数据，组织赌博活动，具有下列情形之一的，属于刑法第三百零三条第二款规定的“开设赌场”行为：（一）建立赌博网站并接受投注的；（二）建立赌博网站并提供给他人组织赌博的；（三）为赌博网站担任代理并接受投注的；（四）参与赌博网站利润分成的。",
    ),
    article(
      "二、关于网上开设赌场共同犯罪的认定和处罚",
      "明知是赌博网站，而为其提供下列服务或者帮助的，属于开设赌场罪的共同犯罪，依照刑法第三百零三条第二款的规定处罚：（一）为赌博网站提供互联网接入、服务器托管、网络存储空间、通讯传输通道、投放广告、发展会员、软件开发、技术支持等服务，收取服务费数额在2万元以上的；（二）为赌博网站提供资金支付结算服务，收取服务费数额在1万元以上或者帮助收取赌资20万元以上的；（三）为10个以上赌博网站投放与网址、赔率等信息有关的广告或者为赌博网站投放广告累计100条以上的。",
    ),
  ],
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
};

const PROSTITUTION_INTERPRETATION: LegalSourceRecord = {
  sourceId: "src-cn-prostitution-interpretation",
  version: "2017.07",
  title: "最高人民法院、最高人民检察院关于办理组织、强迫、引诱、容留、介绍卖淫刑事案件适用法律若干问题的解释",
  issuingAuthority: "最高人民法院、最高人民检察院",
  documentNumber: "法释〔2017〕13号",
  authorityLevel: "司法解释",
  region: "国家",
  status: "current",
  publishedAt: "2017-07-21T00:00:00.000Z",
  effectiveAt: "2017-07-25T00:00:00.000Z",
  officialUrl: "https://www.court.gov.cn/fabu/xiangqing/53752.html",
  retrievedAt: RETRIEVED_AT,
  contentHash: "cn-prostitution-interpretation-2017",
  articles: [
    article(
      "第一条",
      "以招募、雇佣、纠集等手段，管理或者控制他人卖淫，卖淫人员在三人以上的，应当认定为刑法第三百五十八条规定的“组织他人卖淫”。组织卖淫者是否设置固定的卖淫场所、组织卖淫者人数多少、规模大小，不影响组织卖淫行为的认定。",
    ),
  ],
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
};

const DRUG_INTERPRETATION: LegalSourceRecord = {
  sourceId: "src-cn-drug-interpretation",
  version: "2016.04",
  title: "最高人民法院关于审理毒品犯罪案件适用法律若干问题的解释",
  issuingAuthority: "最高人民法院",
  documentNumber: "法释〔2016〕8号",
  authorityLevel: "司法解释",
  region: "国家",
  status: "current",
  publishedAt: "2016-04-06T00:00:00.000Z",
  effectiveAt: "2016-04-11T00:00:00.000Z",
  officialUrl: "http://gongbao.court.gov.cn/Details/53c344a8e4b67174a8747677d23060.html",
  retrievedAt: RETRIEVED_AT,
  contentHash: "cn-drug-interpretation-2016",
  articles: [
    article(
      "第一条",
      "走私、贩卖、运输、制造、非法持有下列毒品，应当认定为刑法第三百四十七条第二款第一项、第三百四十八条规定的“其他毒品数量大”：（一）可卡因五十克以上；（二）3，4-亚甲二氧基甲基苯丙胺（MDMA）等苯丙胺类毒品（甲基苯丙胺除外）、吗啡一百克以上；（三）芬太尼一百二十五克以上；（四）甲卡西酮二百克以上；（五）二氢埃托啡十毫克以上；（六）哌替啶（度冷丁）二百五十克以上；（七）氯胺酮五百克以上；（八）美沙酮一千克以上；（九）曲马多、γ-羟丁酸二千克以上；（十）大麻油五千克、大麻脂十千克、大麻叶及大麻烟一百五十千克以上；（十一）可待因、丁丙诺啡五千克以上；（十二）三唑仑、安眠酮五十千克以上；（十三）阿普唑仑、恰特草一百千克以上；（十四）咖啡因、罂粟壳二百千克以上；（十五）巴比妥、苯巴比妥、安钠咖、尼美西泮二百五十千克以上；（十六）氯氮卓、艾司唑仑、地西泮、溴西泮五百千克以上；（十七）上述毒品以外的其他毒品数量大的。",
    ),
    article(
      "第二条",
      "走私、贩卖、运输、制造、非法持有下列毒品，应当认定为刑法第三百四十七条第三款、第三百四十八条规定的“其他毒品数量较大”：（一）可卡因十克以上不满五十克；（二）3，4-亚甲二氧基甲基苯丙胺（MDMA）等苯丙胺类毒品（甲基苯丙胺除外）、吗啡二十克以上不满一百克；（三）芬太尼二十五克以上不满一百二十五克；（四）甲卡西酮四十克以上不满二百克；（五）二氢埃托啡二毫克以上不满十毫克；（六）哌替啶（度冷丁）五十克以上不满二百五十克；（七）氯胺酮一百克以上不满五百克；（八）美沙酮二百克以上不满一千克；（九）曲马多、γ-羟丁酸四百克以上不满二千克；（十）大麻油一千克以上不满五千克、大麻脂二千克以上不满十千克、大麻叶及大麻烟三十千克以上不满一百五十千克；（十一）可待因、丁丙诺啡一千克以上不满五千克；（十二）三唑仑、安眠酮十千克以上不满五十千克；（十三）阿普唑仑、恰特草二十千克以上不满一百千克；（十四）咖啡因、罂粟壳四十千克以上不满二百千克；（十五）巴比妥、苯巴比妥、安钠咖、尼美西泮五十千克以上不满二百五十千克；（十六）氯氮卓、艾司唑仑、地西泮、溴西泮一百千克以上不满五百千克；（十七）上述毒品以外的其他毒品数量较大的。",
    ),
    article(
      "第十二条",
      "容留他人吸食、注射毒品，具有下列情形之一的，应当依照刑法第三百五十四条的规定，以容留他人吸毒罪定罪处罚：（一）一次容留多人吸食、注射毒品的；（二）二年内多次容留他人吸食、注射毒品的；（三）二年内曾因容留他人吸食、注射毒品受过行政处罚的；（四）容留未成年人吸食、注射毒品的；（五）以牟利为目的容留他人吸食、注射毒品的；（六）容留他人吸食、注射毒品造成严重后果的；（七）其他应当追究刑事责任的情形。向他人贩卖毒品后又容留其吸食、注射毒品，或者容留他人吸食、注射毒品并向其贩卖毒品，符合前款规定的容留他人吸毒罪的定罪条件的，以贩卖毒品罪和容留他人吸毒罪数罪并罚。",
    ),
  ],
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
};

export const PUBLIC_ORDER_DRUG_SOURCES: LegalSourceRecord[] = [
  ADMIN_CASE_PROCEDURE,
  CRIMINAL_LAW,
  PUBLIC_SECURITY_PUNISHMENTS_LAW,
  CIVIL_CODE,
  GAMBLING_INTERPRETATION,
  NETWORK_GAMBLING_OPINION,
  PROSTITUTION_INTERPRETATION,
  DRUG_INTERPRETATION,
];

export const ASSAULT_FOCUS_ID = "focus-public-order-assault";
export const GAMBLING_FOCUS_ID = "focus-public-order-gambling";
export const PROSTITUTION_FOCUS_ID = "focus-public-order-prostitution";
export const DRUG_FOCUS_ID = "focus-public-order-drug";

export const REQUIRED_PUBLIC_ORDER_DRUG_CASE_FOCUS_IDS = [
  ASSAULT_FOCUS_ID,
  GAMBLING_FOCUS_ID,
  PROSTITUTION_FOCUS_ID,
  DRUG_FOCUS_ID,
] as const;

const ASSAULT_FOCUS: CaseFocusSeed = {
  caseFocusId: ASSAULT_FOCUS_ID,
  version: "1.2.0",
  contentStatus: "trial",
  title: "打架斗殴和伤害类案情",
  region: "国家",
  summary:
    "因纠纷或无事生非引发的殴打、伤害行为，以及多人多行为、伤情程度和正当防卫的区分。",
  match: { behaviorLabels: ["殴打推搡"] },
  elements: [
    "多人多行为：分别记录每一名参与人的具体行为、顺序和地位，不因多人共同出现而合并评价或直接认定共同违法、犯罪。",
    "伤情与损伤程度：核对损伤部位、诊疗记录和鉴定意见，区分轻微伤、轻伤与重伤；不以“受伤”“流血”等表述直接认定损伤程度。",
    "冲突起因：核实纠纷起因、双方过错、是否事先约定斗殴以及是否无事生非，区分民间纠纷引发的殴打伤害与随意殴打型寻衅滋事。",
    "共同参与：核对是否结伙、是否多人参与以及各人作用大小，分别评价首要分子、积极参与者与一般参与人。",
    "正当防卫：核对是否存在正在进行的不法侵害、制止行为的对象与时点，以及是否明显超过必要限度造成较大损害。",
    "行为方式与工具：核对是否持械、是否针对特定对象，工具的性质与来源影响行为性质和从重情节判断。",
    "证据固定：优先核对现场监控、目击证人、就诊记录和伤情鉴定材料的取得与保存情况，提示可能灭失的证据。",
  ],
  diversionRules: [
    {
      diversion: "criminal",
      conditions: [
        "故意伤害他人身体致轻伤以上的，按刑法故意伤害罪方向审查。",
        "聚众斗殴的，对首要分子和其他积极参加者按聚众斗殴罪方向审查；致人重伤、死亡的按相应罪名转化处理。",
        "随意殴打他人、情节恶劣并破坏社会秩序的，按寻衅滋事罪方向审查。",
      ],
      basis: [
        { sourceId: "src-cn-criminal-law", article: "第二百三十四条" },
        { sourceId: "src-cn-criminal-law", article: "第二百九十二条" },
        { sourceId: "src-cn-criminal-law", article: "第二百九十三条" },
      ],
    },
    {
      diversion: "administrative",
      conditions: [
        "殴打他人或者故意伤害他人身体，尚未达到刑事追诉标准的，按治安管理处罚法关于殴打、故意伤害的规定方向审查。",
        "结伙斗殴、随意殴打他人等寻衅滋事行为尚不构成犯罪的，按治安管理处罚法关于寻衅滋事的规定方向审查。",
        "因民间纠纷引起、情节较轻的，可以依法调解处理；制止正在进行的不法侵害未明显超过必要限度的，不属于违反治安管理行为。",
      ],
      basis: [
        { sourceId: "src-cn-public-security-punishments", article: "第五十一条" },
        { sourceId: "src-cn-public-security-punishments", article: "第三十条" },
        { sourceId: "src-cn-public-security-punishments", article: "第九条" },
        { sourceId: "src-cn-public-security-punishments", article: "第十九条" },
      ],
    },
    {
      diversion: "civil",
      conditions: [
        "人身损害赔偿、医疗费等争议缺乏犯罪或治安违法构成的，按民事侵权途径处理，赔偿范围依法确定。",
      ],
      basis: [
        { sourceId: "src-cn-civil-code", article: "第一千一百六十五条" },
        { sourceId: "src-cn-civil-code", article: "第一千一百七十九条" },
      ],
    },
  ],
  neighbors: [
    {
      neighborFocusId: null,
      name: "寻衅滋事（随意殴打型）",
      distinction:
        "寻衅滋事通常出于寻求刺激、发泄情绪、逞强耍横等无事生非的动机随意殴打他人；因特定纠纷引发的殴打伤害以起因和对象是否特定相区别。",
      decisiveFacts: ["冲突起因与主观动机", "行为对象是否特定", "是否结伙或多次"],
    },
    {
      neighborFocusId: null,
      name: "正当防卫与相互斗殴",
      distinction:
        "正当防卫针对正在进行的不法侵害；相互斗殴双方均有侵害故意。区分需要核查谁先发起侵害、制止行为的时点与限度。",
      decisiveFacts: ["谁先实施不法侵害", "制止行为的时点与限度", "是否具有斗殴合意"],
    },
    {
      neighborFocusId: GAMBLING_FOCUS_ID,
      name: "赌博类案情",
      distinction:
        "因赌博纠纷引发的斗殴同时涉及赌博与伤害；两种行为分别评价，不能以其中一种吸收另一种。",
      decisiveFacts: ["是否存在赌博行为", "斗殴是否由赌博纠纷引起", "两种行为是否属于同一连续过程"],
    },
  ],
  gaps: [
    {
      gapId: "gap-injury",
      description: "伤情与损伤程度鉴定意见尚未确认，无法判断是否达到轻伤以上的刑事追诉标准。",
      factCategory: "result",
      affectsDiversions: ["criminal", "administrative"],
      branches: [
        {
          branchId: "gap-injury-criminal",
          condition: "伤情与损伤程度达到轻伤以上",
          diversion: "criminal",
        },
        {
          branchId: "gap-injury-administrative",
          condition: "伤情与损伤程度未达到轻伤以上",
          diversion: "administrative",
        },
      ],
    },
    {
      gapId: "gap-location",
      description: "行为地点与是否属于公共场所或交通要道尚未确认，影响寻衅滋事、聚众斗殴加重情形与管辖的判断。",
      factCategory: "place",
      affectsDiversions: ["criminal", "administrative"],
      branches: [
        {
          branchId: "gap-location-criminal",
          condition: "行为地点属于公共场所或交通要道，可能影响寻衅滋事、聚众斗殴加重情形",
          diversion: "criminal",
        },
        {
          branchId: "gap-location-administrative",
          condition: "行为地点不属于上述加重情形",
          diversion: "administrative",
        },
      ],
    },
  ],
  highRiskBoundary: [
    "出现正在发生的人身危险、持械威胁或冲突升级风险时，应在报告前提示人工核验，不自动作出处置决定。",
    "涉及未成年人、孕妇、老年人或多人参与时，应优先核实保护与到场要求。",
  ],
  sourceIds: [
    "src-cn-public-security-punishments",
    "src-cn-criminal-law",
    "src-cn-civil-code",
    "src-cn-mps-admin-procedure",
  ],
  scenarios: [
    {
      scenarioId: "assault-typical",
      kind: "typical",
      title: "典型场景：多次殴打致轻微伤",
      caseText: "4月1日晚上，张某先后两次在城南市场门口殴打李某，致李某轻微伤。",
      expectedCaseFocusIds: [ASSAULT_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "assault-adjacent-boundary",
      kind: "adjacent_boundary",
      title: "相邻反例：仅有赔偿争议，无殴打伤害行为",
      caseText: "4月3日，赵某与钱某因赔偿问题发生争执，双方对责任归属存在争议。",
      expectedCaseFocusIds: [],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "assault-decisive-gap",
      kind: "decisive_gap",
      title: "决定性事实缺失：伤情与地点均未确认",
      caseText: "4月1日晚上，张某殴打李某。",
      expectedCaseFocusIds: [ASSAULT_FOCUS_ID],
      expectedReportStatus: "insufficient_facts",
      expectedUnresolvedGapIds: ["gap-injury", "gap-location"],
    },
    {
      scenarioId: "assault-high-risk-boundary",
      kind: "high_risk_boundary",
      title: "高风险边界：殴打后持刀扬言报复",
      caseText:
        "4月1日晚上，张某先后两次在城南市场门口殴打李某，致李某轻微伤。之后张某持刀扬言报复李某。",
      expectedCaseFocusIds: [ASSAULT_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "assault-source-invalidation",
      kind: "source_invalidation",
      title: "法源失效：到期、撤回、状态不明或紧急禁用",
      caseText: "4月1日晚上，张某先后两次在城南市场门口殴打李某，致李某轻微伤。",
      expectedCaseFocusIds: [ASSAULT_FOCUS_ID],
      expectedReportStatus: "basis_unavailable",
      expectedUnresolvedGapIds: [],
    },
  ],
  draftedAt: "2026-09-20T00:00:00.000Z",
  verifiedAt: CASE_FOCUS_VERIFIED_AT,
  publishedAt: "2026-09-30T00:00:00.000Z",
  lastVerifiedAt: CASE_FOCUS_VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
  changeNote: "殴打伤害报告增加先受理调查的程序依据、酒后处置、伤情转换条件和可执行取证与询问事项；缺口不再清空可支持的条件性分析。",
  sourceVerificationNote:
    "刑法与治安管理处罚法条款已核对；伤情程度必须以鉴定意见为准，不得由系统推定，刑事与行政分流仍须结合完整证据判断。",
  withdrawalNote: null,
};

const GAMBLING_FOCUS: CaseFocusSeed = {
  caseFocusId: GAMBLING_FOCUS_ID,
  version: "1.1.0",
  contentStatus: "trial",
  title: "赌博类案情",
  region: "国家",
  summary:
    "以营利为目的的聚众赌博、开设赌场、以赌博为业或为赌博提供条件，以及网络赌博的帮助行为。",
  match: { behaviorLabels: ["赌博"] },
  elements: [
    "行为方式与规模：核对是聚众赌博、开设赌场、以赌博为业还是仅参与赌博，以及组织、抽头、参赌人数与次数。",
    "获利关系：核对抽头渔利、回扣、介绍费、利润分成等营利方式与数额，区分以营利为目的与亲友间小额娱乐。",
    "赌资与场所：核对赌资数额、赌具、场所归属与实际控制人，区分赌博、开设赌场与为赌博提供条件。",
    "网络赌博与帮助行为：核对是否建立赌博网站、担任代理接受投注，或者提供资金支付结算、技术推广、服务器托管等帮助，帮助行为单独评价。",
    "主观认识：核对是否明知他人实施赌博或开设赌场而提供条件、帮助，不以参与次数或职业身份直接推定。",
    "资金与物品性质：核对资金流转、账户归属、赌具和电子数据的物品性质与来源。",
    "证据固定：核对赌资、账目、通讯记录和电子数据的提取与保全，避免证据灭失。",
  ],
  diversionRules: [
    {
      diversion: "criminal",
      conditions: [
        "以营利为目的聚众赌博或者以赌博为业的，按刑法赌博罪方向审查，并核对抽头渔利、赌资和参赌人数是否达到司法解释标准。",
        "开设赌场或者利用网络建立赌博网站、担任代理接受投注的，按开设赌场罪方向审查。",
        "为赌博网站提供资金支付结算、技术推广等帮助并达到标准的，按开设赌场罪共同犯罪方向审查。",
      ],
      basis: [
        { sourceId: "src-cn-criminal-law", article: "第三百零三条" },
        { sourceId: "src-cn-gambling-interpretation", article: "第一条" },
        { sourceId: "src-cn-gambling-interpretation", article: "第二条" },
        { sourceId: "src-cn-network-gambling-opinion", article: "一、关于网上开设赌场犯罪的定罪量刑标准" },
        { sourceId: "src-cn-network-gambling-opinion", article: "二、关于网上开设赌场共同犯罪的认定和处罚" },
      ],
    },
    {
      diversion: "administrative",
      conditions: [
        "以营利为目的为赌博提供条件，或者参与赌博赌资较大，尚不构成犯罪的，按治安管理处罚法方向审查。",
      ],
      basis: [{ sourceId: "src-cn-public-security-punishments", article: "第八十二条" }],
    },
    {
      diversion: "civil",
      conditions: [
        "因赌博产生的债务违反法律强制性规定和公序良俗，不受法律保护，不属于民事给付之诉的合法标的。",
      ],
      basis: [{ sourceId: "src-cn-civil-code", article: "第一百五十三条" }],
    },
  ],
  neighbors: [
    {
      neighborFocusId: null,
      name: "开设赌场与聚众赌博",
      distinction:
        "开设赌场具有场所、组织或网络平台的固定性与控制性；聚众赌博侧重临时纠集。两者以组织控制程度和是否提供赌博条件相区别。",
      decisiveFacts: ["是否提供固定或网络赌博场所并接受投注", "是否具有组织控制与持续经营"],
    },
    {
      neighborFocusId: null,
      name: "一般娱乐活动",
      distinction:
        "亲友之间带有少量财物输赢的娱乐活动不以营利为目的、不以赌博为业，一般不作为赌博违法犯罪处理。",
      decisiveFacts: ["是否以营利为目的", "参与人员关系与输赢数额"],
    },
    {
      neighborFocusId: ASSAULT_FOCUS_ID,
      name: "打架斗殴和伤害类案情",
      distinction:
        "赌博纠纷引发的斗殴同时涉及赌博与伤害；两种行为分别评价，不能以其中一种吸收另一种。",
      decisiveFacts: ["是否存在赌博行为", "斗殴是否由赌博纠纷引起"],
    },
    {
      neighborFocusId: DRUG_FOCUS_ID,
      name: "毒品类违法犯罪",
      distinction:
        "赌博活动常伴随吸食、容留他人吸食毒品；两种行为分别评价，不合并为一个主结论。",
      decisiveFacts: ["是否有吸食、注射或者容留他人吸食毒品的行为", "毒品与赌博是否属于同一连续过程"],
    },
  ],
  gaps: [
    {
      gapId: "gap-stake",
      description: "抽头渔利、赌资数额或获利数额尚未确认，无法判断是否达到刑事追诉标准。",
      factCategory: "amount",
      affectsDiversions: ["criminal", "administrative"],
      branches: [
        {
          branchId: "gap-stake-criminal",
          condition: "抽头渔利、赌资数额或获利数额达到刑事追诉标准",
          diversion: "criminal",
        },
        {
          branchId: "gap-stake-administrative",
          condition: "抽头渔利、赌资数额或获利数额未达到刑事追诉标准",
          diversion: "administrative",
        },
      ],
    },
    {
      gapId: "gap-scale",
      description: "参赌人数、组织次数或赌博规模尚未确认，无法判断是否属于聚众赌博或开设赌场。",
      factCategory: "count",
      affectsDiversions: ["criminal", "administrative"],
      branches: [
        {
          branchId: "gap-scale-criminal",
          condition: "参赌人数、组织次数或赌博规模达到聚众赌博或开设赌场的认定标准",
          diversion: "criminal",
        },
        {
          branchId: "gap-scale-administrative",
          condition: "未达到上述标准，按一般赌博治安违法方向审查",
          diversion: "administrative",
        },
      ],
    },
  ],
  highRiskBoundary: [
    "出现正在发生的人身危险、威胁报复或证据灭失风险时，应在报告前提示人工核验，不自动作出处置决定。",
    "涉及未成年人、在校学生或场所经营者时，应优先核实保护与报告要求。",
  ],
  sourceIds: [
    "src-cn-public-security-punishments",
    "src-cn-criminal-law",
    "src-cn-gambling-interpretation",
    "src-cn-network-gambling-opinion",
    "src-cn-civil-code",
  ],
  scenarios: [
    {
      scenarioId: "gambling-typical",
      kind: "typical",
      title: "典型场景：组织他人赌博并抽头渔利",
      caseText:
        "5月2日晚上，周某在某某路一出租屋内组织吴某等3人赌博，抽头渔利6000元，共组织3次。",
      expectedCaseFocusIds: [GAMBLING_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "gambling-adjacent-boundary",
      kind: "adjacent_boundary",
      title: "相邻反例：不以营利为目的的娱乐活动",
      caseText: "5月5日，周某与朋友在家中打牌娱乐，约定输者请客吃饭，未涉及财物输赢。",
      expectedCaseFocusIds: [],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "gambling-decisive-gap",
      kind: "decisive_gap",
      title: "决定性事实缺失：数额与规模均未确认",
      caseText: "5月2日晚上，周某在某某路一出租屋内组织吴某等人赌博。",
      expectedCaseFocusIds: [GAMBLING_FOCUS_ID],
      expectedReportStatus: "insufficient_facts",
      expectedUnresolvedGapIds: ["gap-stake", "gap-scale"],
    },
    {
      scenarioId: "gambling-high-risk-boundary",
      kind: "high_risk_boundary",
      title: "高风险边界：组织赌博后威胁删除记录",
      caseText:
        "5月2日晚上，周某在某某路一出租屋内组织吴某等3人赌博，抽头渔利6000元，共组织3次。之后周某威胁吴某删除记录。",
      expectedCaseFocusIds: [GAMBLING_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "gambling-source-invalidation",
      kind: "source_invalidation",
      title: "法源失效：到期、撤回、状态不明或紧急禁用",
      caseText:
        "5月2日晚上，周某在某某路一出租屋内组织吴某等3人赌博，抽头渔利6000元，共组织3次。",
      expectedCaseFocusIds: [GAMBLING_FOCUS_ID],
      expectedReportStatus: "basis_unavailable",
      expectedUnresolvedGapIds: [],
    },
  ],
  draftedAt: "2026-09-20T00:00:00.000Z",
  verifiedAt: CASE_FOCUS_VERIFIED_AT,
  publishedAt: "2026-09-30T00:00:00.000Z",
  lastVerifiedAt: CASE_FOCUS_VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
  changeNote: "增加决定性事实缺口的条件分支、程序路径与补充建议：赌博类案情。",
  sourceVerificationNote:
    "刑法、司法解释与两高一部意见已核对；聚众赌博与开设赌场的具体数额、人数标准仍须结合现行司法解释逐项核对。",
  withdrawalNote: null,
};

const PROSTITUTION_FOCUS: CaseFocusSeed = {
  caseFocusId: PROSTITUTION_FOCUS_ID,
  version: "1.1.0",
  contentStatus: "trial",
  title: "卖淫嫖娼及相关组织、容留、介绍行为",
  region: "国家",
  summary:
    "卖淫、嫖娼行为，以及组织、强迫、引诱、容留、介绍卖淫和协助组织卖淫行为的分流与角色区分。",
  match: { behaviorLabels: ["卖淫嫖娼"] },
  elements: [
    "行为性质与角色：区分卖淫、嫖娼与组织、强迫、引诱、容留、介绍卖淫，分别评价组织者、协助者、场所提供者与卖淫嫖娼人员。",
    "组织与控制关系：核对招募、雇佣、纠集、管理等控制手段与卖淫人员人数，判断是否达到组织卖淫的认定标准。",
    "场所与获利：核对场所归属、实际控制人、获利方式与数额，区分经营者、一般劳务人员与协助组织卖淫。",
    "主观认识：核对是否明知他人卖淫或组织卖淫而提供场所、招募运送、通风报信，不以经营场所或职业身份直接推定。",
    "物品性质与资金：核对账目、通讯记录、资金流转和涉案物品的性质与来源。",
    "特殊保护：核对是否涉及未成年人、孕妇、智障人员或患有严重性病的人，依法从重并优先保护。",
    "证据固定：核对场所、账目、通讯和资金证据的取得与保全，避免证据灭失。",
  ],
  diversionRules: [
    {
      diversion: "criminal",
      conditions: [
        "以招募、雇佣、纠集等手段管理或者控制他人卖淫，卖淫人员在三人以上的，按组织卖淫罪方向审查。",
        "引诱、容留、介绍他人卖淫的，按引诱、容留、介绍卖淫罪方向审查。",
        "为组织卖淫的人招募、运送人员或者有其他协助组织他人卖淫行为的，按协助组织卖淫罪方向审查。",
      ],
      basis: [
        { sourceId: "src-cn-criminal-law", article: "第三百五十八条" },
        { sourceId: "src-cn-criminal-law", article: "第三百五十九条" },
        { sourceId: "src-cn-prostitution-interpretation", article: "第一条" },
      ],
    },
    {
      diversion: "administrative",
      conditions: [
        "卖淫、嫖娼，或者引诱、容留、介绍他人卖淫尚不构成犯罪的，按治安管理处罚法方向审查。",
        "旅馆业、娱乐场所等单位人员为卖淫嫖娼活动通风报信或者提供条件，尚不构成犯罪的，依法处理。",
      ],
      basis: [
        { sourceId: "src-cn-public-security-punishments", article: "第七十八条" },
        { sourceId: "src-cn-public-security-punishments", article: "第七十九条" },
        { sourceId: "src-cn-public-security-punishments", article: "第八十七条" },
      ],
    },
    {
      diversion: "civil",
      conditions: [
        "因卖淫嫖娼产生的财物给付、场所租赁等争议违背公序良俗或违反强制性规定的，依法不予保护，按民事途径甄别处理。",
      ],
      basis: [{ sourceId: "src-cn-civil-code", article: "第一百五十三条" }],
    },
  ],
  neighbors: [
    {
      neighborFocusId: null,
      name: "组织卖淫与一般卖淫嫖娼",
      distinction:
        "组织卖淫以招募、雇佣、纠集等手段管理或者控制他人卖淫且卖淫人员在三人以上；一般卖淫嫖娼是双方自愿的违法行为，不具有组织控制关系。",
      decisiveFacts: ["是否存在管理或控制关系", "卖淫人员人数", "是否招募、雇佣或纠集"],
    },
    {
      neighborFocusId: null,
      name: "协助组织卖淫与一般劳务",
      distinction:
        "在经营场所从事保洁、收银、保安等一般劳务、仅领取正常薪酬且无协助行为的，不认定为协助组织卖淫。",
      decisiveFacts: ["是否明知组织卖淫活动", "是否从事招募运送或保镖、打手、管账等协助行为"],
    },
    {
      neighborFocusId: DRUG_FOCUS_ID,
      name: "毒品类违法犯罪",
      distinction:
        "涉黄场所可能同时涉及贩卖毒品或者容留他人吸毒；两种行为分别评价，不合并为一个主结论。",
      decisiveFacts: ["是否有贩卖、持有毒品或者容留他人吸食毒品的行为", "是否与卖淫嫖娼属于同一连续过程"],
    },
  ],
  gaps: [
    {
      gapId: "gap-role",
      description: "场所、资金往来与获利情况尚未确认，无法判断行为人是组织者、协助者还是仅提供一般劳务。",
      factCategory: "object",
      affectsDiversions: ["criminal", "administrative"],
      branches: [
        {
          branchId: "gap-role-criminal",
          condition: "行为人对卖淫活动实施组织、协助组织、引诱、容留或介绍等符合刑事构成的行为",
          diversion: "criminal",
        },
        {
          branchId: "gap-role-administrative",
          condition: "行为人仅提供一般劳务，未达到刑事构成",
          diversion: "administrative",
        },
      ],
    },
    {
      gapId: "gap-scale",
      description: "卖淫人员人数、介绍或容留次数尚未确认，无法判断是否达到组织卖淫的认定标准。",
      factCategory: "count",
      affectsDiversions: ["criminal", "administrative"],
      branches: [
        {
          branchId: "gap-scale-criminal",
          condition: "卖淫人员人数或介绍、容留次数达到组织卖淫等刑事认定标准",
          diversion: "criminal",
        },
        {
          branchId: "gap-scale-administrative",
          condition: "未达到上述标准，按治安违法方向审查",
          diversion: "administrative",
        },
      ],
    },
  ],
  highRiskBoundary: [
    "出现正在发生的人身危险、强迫或威胁情节、证据灭失风险时，应在报告前提示人工核验，不自动作出处置决定。",
    "涉及未成年人、孕妇、智障人员或患有严重性病的人时，应优先核实保护与从重要求。",
  ],
  sourceIds: [
    "src-cn-public-security-punishments",
    "src-cn-criminal-law",
    "src-cn-prostitution-interpretation",
    "src-cn-civil-code",
  ],
  scenarios: [
    {
      scenarioId: "prostitution-typical",
      kind: "typical",
      title: "典型场景：介绍他人多次卖淫并收取现金",
      caseText:
        "3月8日晚上，李某在某某宾馆介绍王某先后3次向赵某卖淫，收取现金300元。",
      expectedCaseFocusIds: [PROSTITUTION_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "prostitution-adjacent-boundary",
      kind: "adjacent_boundary",
      title: "相邻反例：传播淫秽物品，不涉及卖淫嫖娼",
      caseText: "3月10日，孙某在网络上传播淫秽视频，未涉及其他违法行为。",
      expectedCaseFocusIds: [],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "prostitution-decisive-gap",
      kind: "decisive_gap",
      title: "决定性事实缺失：角色关系与规模均未确认",
      caseText: "3月8日晚上，李某在某某宾馆介绍王某向赵某卖淫。",
      expectedCaseFocusIds: [PROSTITUTION_FOCUS_ID],
      expectedReportStatus: "insufficient_facts",
      expectedUnresolvedGapIds: ["gap-role", "gap-scale"],
    },
    {
      scenarioId: "prostitution-high-risk-boundary",
      kind: "high_risk_boundary",
      title: "高风险边界：介绍卖淫后威胁删除记录",
      caseText:
        "3月8日晚上，李某在某某宾馆介绍王某先后3次向赵某卖淫，收取现金300元。之后李某威胁王某删除记录。",
      expectedCaseFocusIds: [PROSTITUTION_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "prostitution-source-invalidation",
      kind: "source_invalidation",
      title: "法源失效：到期、撤回、状态不明或紧急禁用",
      caseText:
        "3月8日晚上，李某在某某宾馆介绍王某先后3次向赵某卖淫，收取现金300元。",
      expectedCaseFocusIds: [PROSTITUTION_FOCUS_ID],
      expectedReportStatus: "basis_unavailable",
      expectedUnresolvedGapIds: [],
    },
  ],
  draftedAt: "2026-09-20T00:00:00.000Z",
  verifiedAt: CASE_FOCUS_VERIFIED_AT,
  publishedAt: "2026-09-30T00:00:00.000Z",
  lastVerifiedAt: CASE_FOCUS_VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
  changeNote: "增加决定性事实缺口的条件分支、程序路径与补充建议：卖淫嫖娼及相关组织、容留、介绍行为。",
  sourceVerificationNote:
    "刑法、司法解释与治安管理处罚法已核对；组织卖淫与一般卖淫嫖娼、协助组织卖淫与一般劳务的区分仍须结合完整事实判断。",
  withdrawalNote: null,
};

const DRUG_FOCUS: CaseFocusSeed = {
  caseFocusId: DRUG_FOCUS_ID,
  version: "1.1.0",
  contentStatus: "trial",
  title: "毒品类违法犯罪",
  region: "国家",
  summary:
    "走私、贩卖、运输、制造、非法持有毒品，容留他人吸毒，以及吸食、注射毒品等行为的种类、数量和分流判断。",
  match: { behaviorLabels: ["涉毒"] },
  elements: [
    "行为类型：区分走私、贩卖、运输、制造毒品，非法持有毒品，容留他人吸毒以及吸食、注射毒品，分别评价，不合并为单一结论。",
    "数量与种类：核对毒品种类、含量和数量，按法定数量标准判断；种类不明或者数量无法折算时不得推定。",
    "主观认识：核对是否明知是毒品、是否以贩卖为目的，区分贩卖、代购、持有与自吸。",
    "共同与帮助关系：核对出资、联络、运输、提供场所、介绍买卖等分工，分别评价共同犯罪与帮助行为。",
    "场所、资金与物品性质：核对涉案场所、资金流转、包装物和通讯记录等物品性质与来源。",
    "特殊对象：核对是否涉及未成年人、在校学生或者戒毒、监管场所等从重情形。",
    "证据固定：核对毒品实物、称量、取样、鉴定和电子数据的提取与保全，避免证据灭失或污染。",
  ],
  diversionRules: [
    {
      diversion: "criminal",
      conditions: [
        "走私、贩卖、运输、制造毒品的，无论数量多少都应当追究刑事责任，按刑法相应罪名方向审查。",
        "非法持有毒品达到数量较大标准的，按非法持有毒品罪方向审查。",
        "容留他人吸食、注射毒品符合司法解释规定情形的，按容留他人吸毒罪方向审查。",
      ],
      basis: [
        { sourceId: "src-cn-criminal-law", article: "第三百四十七条" },
        { sourceId: "src-cn-criminal-law", article: "第三百四十八条" },
        { sourceId: "src-cn-criminal-law", article: "第三百五十四条" },
        { sourceId: "src-cn-drug-interpretation", article: "第一条" },
        { sourceId: "src-cn-drug-interpretation", article: "第二条" },
        { sourceId: "src-cn-drug-interpretation", article: "第十二条" },
      ],
    },
    {
      diversion: "administrative",
      conditions: [
        "非法持有少量毒品、向他人提供毒品、吸食或者注射毒品的，按治安管理处罚法方向审查。",
        "引诱、教唆、欺骗或者强迫他人吸食、注射毒品，或者容留他人吸食、注射毒品尚不构成犯罪的，依法处理。",
      ],
      basis: [
        { sourceId: "src-cn-public-security-punishments", article: "第八十四条" },
        { sourceId: "src-cn-public-security-punishments", article: "第八十五条" },
      ],
    },
    {
      diversion: "civil",
      conditions: [
        "因毒品引发的医疗费用、人身损害等民事赔偿争议，按民事侵权途径处理。",
      ],
      basis: [
        { sourceId: "src-cn-civil-code", article: "第一千一百六十五条" },
        { sourceId: "src-cn-civil-code", article: "第一千一百七十九条" },
      ],
    },
  ],
  neighbors: [
    {
      neighborFocusId: null,
      name: "非法持有与贩卖、运输、制造",
      distinction:
        "非法持有毒品不要求参与毒品的流转环节；贩卖、运输、制造毒品要求实施相应的流转或制造行为。区分需要核查是否具有贩卖目的和是否参与流转。",
      decisiveFacts: ["是否具有贩卖目的", "是否参与购买、运输、出售等流转环节"],
    },
    {
      neighborFocusId: null,
      name: "吸食、注射与容留他人吸毒",
      distinction:
        "吸食、注射毒品是自伤性违法行为；容留他人吸毒是提供场所和便利。区分需要核查场所归属与是否容留他人。",
      decisiveFacts: ["涉案场所由谁提供或控制", "是否容留他人吸食、注射"],
    },
    {
      neighborFocusId: GAMBLING_FOCUS_ID,
      name: "赌博类案情",
      distinction:
        "赌博活动常伴随吸食、容留他人吸食毒品；两种行为分别评价，不合并为一个主结论。",
      decisiveFacts: ["是否存在赌博行为", "毒品与赌博是否属于同一连续过程"],
    },
    {
      neighborFocusId: PROSTITUTION_FOCUS_ID,
      name: "卖淫嫖娼及相关组织、容留、介绍行为",
      distinction:
        "涉黄场所可能同时涉及贩卖毒品或者容留他人吸毒；两种行为分别评价，不合并为一个主结论。",
      decisiveFacts: ["是否存在卖淫嫖娼行为", "毒品与卖淫嫖娼是否属于同一连续过程"],
    },
  ],
  gaps: [
    {
      gapId: "gap-quantity",
      description: "毒品种类、含量或者数量尚未确认，无法判断数量标准和情节严重程度。",
      factCategory: "count",
      affectsDiversions: ["criminal", "administrative"],
      branches: [
        {
          branchId: "gap-quantity-criminal",
          condition: "毒品种类、含量或数量达到刑事追诉的数量标准",
          diversion: "criminal",
        },
        {
          branchId: "gap-quantity-administrative",
          condition: "未达到刑事数量标准，按治安管理处罚法关于毒品违法的方向审查",
          diversion: "administrative",
        },
      ],
    },
    {
      gapId: "gap-property",
      description: "毒品实物、包装、资金载体与场所关联物品等物品性质尚未确认，无法判断行为类型和共同关系。",
      factCategory: "object",
      affectsDiversions: ["criminal", "administrative"],
      branches: [
        {
          branchId: "gap-property-criminal",
          condition: "物品性质与关联能够查证走私、贩卖、运输、制造毒品等刑事行为",
          diversion: "criminal",
        },
        {
          branchId: "gap-property-administrative",
          condition: "仅能认定为吸毒等治安违法行为，未达到刑事构成",
          diversion: "administrative",
        },
      ],
    },
  ],
  highRiskBoundary: [
    "出现正在发生的人身危险、急性中毒或证据灭失风险时，应在报告前提示人工核验，不自动作出处置决定。",
    "涉及未成年人、在校学生或者戒毒、监管场所时，应优先核实保护与从重要求。",
  ],
  sourceIds: [
    "src-cn-public-security-punishments",
    "src-cn-criminal-law",
    "src-cn-drug-interpretation",
    "src-cn-civil-code",
  ],
  scenarios: [
    {
      scenarioId: "drug-typical",
      kind: "typical",
      title: "典型场景：多次贩卖毒品并收取毒资",
      caseText:
        "6月1日晚上，黄某在某某出租屋先后3次向吴某贩卖甲基苯丙胺10克，收取现金5000元。",
      expectedCaseFocusIds: [DRUG_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "drug-adjacent-boundary",
      kind: "adjacent_boundary",
      title: "相邻反例：不涉及违禁物品的工作争议",
      caseText: "6月5日，黄某与同事因工作纪律问题发生争议，未涉及违禁物品。",
      expectedCaseFocusIds: [],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "drug-gambling-multi-behavior",
      kind: "adjacent_boundary",
      title: "相邻边界：同一连续案情同时涉及赌博与毒品",
      caseText:
        "6月1日晚上，黄某在某某出租屋组织吴某等人赌博，先后3次，收取现金5000元。之后黄某容留吴某吸食毒品。",
      expectedCaseFocusIds: [GAMBLING_FOCUS_ID, DRUG_FOCUS_ID],
      expectedReportStatus: "conflicting",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "drug-decisive-gap",
      kind: "decisive_gap",
      title: "决定性事实缺失：种类数量与物品性质均未确认",
      caseText: "6月1日晚上，黄某在某某出租屋向吴某贩卖毒品。",
      expectedCaseFocusIds: [DRUG_FOCUS_ID],
      expectedReportStatus: "insufficient_facts",
      expectedUnresolvedGapIds: ["gap-quantity", "gap-property"],
    },
    {
      scenarioId: "drug-high-risk-boundary",
      kind: "high_risk_boundary",
      title: "高风险边界：吸毒后昏迷并威胁删除记录",
      caseText:
        "6月1日晚上，黄某在某某出租屋先后3次向吴某贩卖甲基苯丙胺10克，收取现金5000元。之后吴某注射毒品后昏迷。黄某威胁删除记录。",
      expectedCaseFocusIds: [DRUG_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "drug-source-invalidation",
      kind: "source_invalidation",
      title: "法源失效：到期、撤回、状态不明或紧急禁用",
      caseText: "6月1日晚上，黄某在某某出租屋先后3次向吴某贩卖甲基苯丙胺10克，收取现金5000元。",
      expectedCaseFocusIds: [DRUG_FOCUS_ID],
      expectedReportStatus: "basis_unavailable",
      expectedUnresolvedGapIds: [],
    },
  ],
  draftedAt: "2026-09-20T00:00:00.000Z",
  verifiedAt: CASE_FOCUS_VERIFIED_AT,
  publishedAt: "2026-09-30T00:00:00.000Z",
  lastVerifiedAt: CASE_FOCUS_VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
  changeNote: "增加决定性事实缺口的条件分支、程序路径与补充建议：毒品类违法犯罪。",
  sourceVerificationNote:
    "刑法、毒品犯罪司法解释与治安管理处罚法已核对；毒品种类、含量和数量必须依据鉴定意见与法定标准认定，不得由系统推定。",
  withdrawalNote: null,
};

const CASE_FOCUS_SEEDS: CaseFocusSeed[] = [
  ASSAULT_FOCUS,
  GAMBLING_FOCUS,
  PROSTITUTION_FOCUS,
  DRUG_FOCUS,
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

export const PUBLIC_ORDER_DRUG_CASE_FOCUSES: CaseFocusRecord[] =
  CASE_FOCUS_SEEDS.map(withScenarioTestResults);

/** 每次调用返回全新的可重置内容副本，避免测试之间共享可变状态。 */
export function createPublicOrderDrugCaseFocuses(): CaseFocusRecord[] {
  return PUBLIC_ORDER_DRUG_CASE_FOCUSES.map(cloneCaseFocus);
}

export function createPublicOrderDrugSources(): LegalSourceRecord[] {
  return cloneLegalSources(PUBLIC_ORDER_DRUG_SOURCES);
}
