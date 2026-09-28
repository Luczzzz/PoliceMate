import type { CaseFocusRecord, LegalSourceRecord } from "./model";
import {
  CIVIL_CODE,
  CRIMINAL_LAW,
  PUBLIC_SECURITY_PUNISHMENTS_LAW,
} from "./national-legal-sources";
import { cloneCaseFocus, cloneLegalSources } from "./store";
import { ASSAULT_FOCUS_ID } from "./public-order-drug-content";

/**
 * 家庭与未成年人高风险派出所重点案情内容包。
 *
 * 范围（产品规格 3.2 第 9–10 组）：
 * 9. 家庭暴力及婚恋、家庭矛盾升级；
 * 10. 侵害未成年人及涉未成年人高风险案情。
 *
 * 这些是内容维护者起草并核验的试行辅助内容，不是法制审核、业务审定或机关
 * 授权结论。全部法源限定为国家公开正式规范；未包含任何真实身份信息、未经授权
 * 材料、商业数据库正文或模型生成的生产依据。两组内容都必须同时交付典型、
 * 相邻反例、决定性事实缺失、高风险边界和法源失效场景，并由
 * `test/family-minor-scenarios.test.ts` 与内容发布检查共同验证。
 *
 * 家庭关系、年龄描述和危险关键词只作为受治理内容的匹配线索，不据此自动认定
 * 违法犯罪或者紧急状态；是否受理、立案、采取保护措施均须民警人工核验。
 */

/** 场景测试结果由场景自身派生，避免测试标识与场景 ID 漂移。 */
type CaseFocusSeed = Omit<CaseFocusRecord, "testResults">;

const MAINTAINER = "受控试行内容维护者（家庭与未成年人高风险）";
const VERIFIED_AT = "2026-09-29T00:00:00.000Z";
const RETRIEVED_AT = "2026-09-29T00:00:00.000Z";
/** 初步定性、受立案条件与刑事/行政分流内容最长每 30 天重新核验（规格 13.7）。 */
const NEXT_REVIEW_DUE_AT = "2026-10-29T00:00:00.000Z";

function article(location: string, minimalText: string): { location: string; minimalText: string } {
  return { location, minimalText };
}

const ANTI_DOMESTIC_VIOLENCE_LAW: LegalSourceRecord = {
  sourceId: "src-cn-anti-domestic-violence-law",
  version: "2016.03",
  title: "中华人民共和国反家庭暴力法",
  issuingAuthority: "全国人民代表大会常务委员会",
  documentNumber: "中华人民共和国主席令第三十七号",
  authorityLevel: "法律",
  region: "国家",
  status: "current",
  publishedAt: "2015-12-27T00:00:00.000Z",
  effectiveAt: "2016-03-01T00:00:00.000Z",
  officialUrl: "https://www.gov.cn/zhengce/2015-12/28/content_5029898.htm",
  retrievedAt: RETRIEVED_AT,
  contentHash: "cn-anti-domestic-violence-law-2016",
  articles: [
    article(
      "第二条",
      "本法所称家庭暴力，是指家庭成员之间以殴打、捆绑、残害、限制人身自由以及经常性谩骂、恐吓等方式实施的身体、精神等侵害行为。",
    ),
    article(
      "第五条",
      "反家庭暴力工作遵循预防为主，教育、矫治与惩处相结合原则。反家庭暴力工作应当尊重受害人真实意愿，保护当事人隐私。未成年人、老年人、残疾人、孕期和哺乳期的妇女、重病患者遭受家庭暴力的，应当给予特殊保护。",
    ),
    article(
      "第十四条",
      "学校、幼儿园、医疗机构、居民委员会、村民委员会、社会工作服务机构、救助管理机构、福利机构及其工作人员在工作中发现无民事行为能力人、限制民事行为能力人遭受或者疑似遭受家庭暴力的，应当及时向公安机关报案。公安机关应当对报案人的信息予以保密。",
    ),
    article(
      "第十五条",
      "公安机关接到家庭暴力报案后应当及时出警，制止家庭暴力，按照有关规定调查取证，协助受害人就医、鉴定伤情。无民事行为能力人、限制民事行为能力人因家庭暴力身体受到严重伤害、面临人身安全威胁或者处于无人照料等危险状态的，公安机关应当通知并协助民政部门将其安置到临时庇护场所、救助管理机构或者福利机构。",
    ),
    article(
      "第十六条",
      "家庭暴力情节较轻，依法不给予治安管理处罚的，由公安机关对加害人给予批评教育或者出具告诫书。告诫书应当包括加害人的身份信息、家庭暴力的事实陈述、禁止加害人实施家庭暴力等内容。",
    ),
    article(
      "第十七条",
      "公安机关应当将告诫书送交加害人、受害人，并通知居民委员会、村民委员会。居民委员会、村民委员会、公安派出所应当对收到告诫书的加害人、受害人进行查访，监督加害人不再实施家庭暴力。",
    ),
    article(
      "第二十一条",
      "监护人实施家庭暴力严重侵害被监护人合法权益的，人民法院可以根据被监护人的近亲属、居民委员会、村民委员会、县级人民政府民政部门等有关人员或者单位的申请，依法撤销其监护人资格，另行指定监护人。被撤销监护人资格的加害人，应当继续负担相应的赡养、扶养、抚养费用。",
    ),
    article(
      "第二十三条",
      "当事人因遭受家庭暴力或者面临家庭暴力的现实危险，向人民法院申请人身安全保护令的，人民法院应当受理。当事人是无民事行为能力人、限制民事行为能力人，或者因受到强制、威吓等原因无法申请人身安全保护令的，其近亲属、公安机关、妇女联合会、居民委员会、村民委员会、救助管理机构可以代为申请。",
    ),
    article(
      "第三十三条",
      "加害人实施家庭暴力，构成违反治安管理行为的，依法给予治安管理处罚；构成犯罪的，依法追究刑事责任。",
    ),
    article(
      "第三十七条",
      "家庭成员以外共同生活的人之间实施的暴力行为，参照本法规定执行。",
    ),
  ],
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
};

const MINORS_PROTECTION_LAW: LegalSourceRecord = {
  sourceId: "src-cn-minors-protection-law",
  version: "2021.06",
  title: "中华人民共和国未成年人保护法（2020年修订）",
  issuingAuthority: "全国人民代表大会常务委员会",
  documentNumber: "中华人民共和国主席令第五十七号",
  authorityLevel: "法律",
  region: "国家",
  status: "current",
  publishedAt: "2020-10-17T00:00:00.000Z",
  effectiveAt: "2021-06-01T00:00:00.000Z",
  officialUrl: "https://www.gov.cn/xinwen/2020-10/18/content_5552110.htm",
  retrievedAt: RETRIEVED_AT,
  contentHash: "cn-minors-protection-law-2021-06",
  articles: [
    article(
      "第十一条",
      "任何组织或者个人发现不利于未成年人身心健康或者侵犯未成年人合法权益的情形，都有权劝阻、制止或者向公安、民政、教育等有关部门提出检举、控告。国家机关、居民委员会、村民委员会、密切接触未成年人的单位及其工作人员，在工作中发现未成年人身心健康受到侵害、疑似受到侵害或者面临其他危险情形的，应当立即向公安、民政、教育等有关部门报告。有关部门接到涉及未成年人的检举、控告或者报告，应当依法及时受理、处置，并以适当方式将处理结果告知相关单位和人员。",
    ),
    article(
      "第十七条",
      "未成年人的父母或者其他监护人不得实施下列行为：（一）虐待、遗弃、非法送养未成年人或者对未成年人实施家庭暴力；（二）放任、教唆或者利用未成年人实施违法犯罪行为；……（十一）其他侵犯未成年人身心健康、财产权益或者不依法履行未成年人保护义务的行为。",
    ),
    article(
      "第五十四条",
      "禁止拐卖、绑架、虐待、非法收养未成年人，禁止对未成年人实施性侵害、性骚扰。禁止胁迫、引诱、教唆未成年人参加黑社会性质组织或者从事违法犯罪活动。禁止胁迫、诱骗、利用未成年人乞讨。",
    ),
    article(
      "第九十二条",
      "具有下列情形之一的，民政部门应当依法对未成年人进行临时监护：（一）未成年人流浪乞讨或者身份不明，暂时查找不到父母或者其他监护人；（二）监护人下落不明且无其他人可以担任监护人；（三）监护人因自身客观原因或者因发生自然灾害、事故灾难、公共卫生事件等突发事件不能履行监护职责，导致未成年人监护缺失；（四）监护人拒绝或者怠于履行监护职责，导致未成年人处于无人照料的状态；（五）监护人教唆、利用未成年人实施违法犯罪行为，未成年人需要被带离安置；（六）未成年人遭受监护人严重伤害或者面临人身安全威胁，需要被紧急安置；（七）法律规定的其他情形。",
    ),
    article(
      "第一百零一条",
      "公安机关、人民检察院、人民法院和司法行政部门应当确定专门机构或者指定专门人员，负责办理涉及未成年人案件。办理涉及未成年人案件的人员应当经过专门培训，熟悉未成年人身心特点。专门机构或者专门人员中，应当有女性工作人员。公安机关、人民检察院、人民法院和司法行政部门应当对上述机构和人员实行与未成年人保护工作相适应的评价考核标准。",
    ),
    article(
      "第一百一十条",
      "公安机关、人民检察院、人民法院讯问未成年犯罪嫌疑人、被告人，询问未成年被害人、证人，应当依法通知其法定代理人或者其成年亲属、所在学校的代表等合适成年人到场，并采取适当方式，在适当场所进行，保障未成年人的名誉权、隐私权和其他合法权益。人民法院开庭审理涉及未成年人案件，未成年被害人、证人一般不出庭作证；必须出庭的，应当采取保护其隐私的技术手段和心理干预等保护措施。",
    ),
    article(
      "第一百一十一条",
      "公安机关、人民检察院、人民法院应当与其他有关政府部门、人民团体、社会组织互相配合，对遭受性侵害或者暴力伤害的未成年被害人及其家庭实施必要的心理干预、经济救助、法律援助、转学安置等保护措施。",
    ),
    article(
      "第一百一十二条",
      "公安机关、人民检察院、人民法院办理未成年人遭受性侵害或者暴力伤害案件，在询问未成年被害人、证人时，应当采取同步录音录像等措施，尽量一次完成；未成年被害人、证人是女性的，应当由女性工作人员进行。",
    ),
  ],
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
};

const MANDATORY_REPORT_OPINION: LegalSourceRecord = {
  sourceId: "src-cn-mandatory-report-opinion",
  version: "2020.05",
  title:
    "最高人民检察院、国家监察委员会、教育部、公安部、民政部、司法部、国家卫生健康委员会、中国共产主义青年团中央委员会、中华全国妇女联合会关于建立侵害未成年人案件强制报告制度的意见（试行）",
  issuingAuthority: "最高人民检察院等九部门",
  documentNumber: "未载明文号（最高人民检察院官网公开发布）",
  authorityLevel: "规范性文件",
  region: "国家",
  status: "current",
  publishedAt: "2020-05-07T00:00:00.000Z",
  effectiveAt: "2020-05-07T00:00:00.000Z",
  officialUrl: "https://www.spp.gov.cn/xwfbh/wsfbt/202005/t20200529_463482.shtml",
  retrievedAt: RETRIEVED_AT,
  contentHash: "cn-mandatory-report-opinion-2020",
  articles: [
    article(
      "第二条",
      "侵害未成年人案件强制报告，是指国家机关、法律法规授权行使公权力的各类组织及法律规定的公职人员，密切接触未成年人行业的各类组织及其从业人员，在工作中发现未成年人遭受或者疑似遭受不法侵害以及面临不法侵害危险的，应当立即向公安机关报案或举报。",
    ),
    article(
      "第四条",
      "本意见所称在工作中发现未成年人遭受或者疑似遭受不法侵害以及面临不法侵害危险的情况包括：（一）未成年人的生殖器官或隐私部位遭受或疑似遭受非正常损伤的；（二）不满十四周岁的女性未成年人遭受或疑似遭受性侵害、怀孕、流产的；（三）十四周岁以上女性未成年人遭受或疑似遭受性侵害所致怀孕、流产的；（四）未成年人身体存在多处损伤、严重营养不良、意识不清，存在或疑似存在受到家庭暴力、欺凌、虐待、殴打或者被人麻醉等情形的；（五）未成年人因自杀、自残、工伤、中毒、被人麻醉、殴打等非正常原因导致伤残、死亡情形的；（六）未成年人被遗弃或长期处于无人照料状态的；（七）发现未成年人来源不明、失踪或者被拐卖、收买的；（八）发现未成年人被组织乞讨的；（九）其他严重侵害未成年人身心健康的情形或未成年人正在面临不法侵害危险的。",
    ),
    article(
      "第八条",
      "公安机关接到疑似侵害未成年人权益的报案或举报后，应当立即接受，问明案件初步情况，并制作笔录。根据案件的具体情况，涉嫌违反治安管理的，依法受案审查；涉嫌犯罪的，依法立案侦查。对不属于自己管辖的，及时移送有管辖权的公安机关。",
    ),
    article(
      "第九条",
      "公安机关侦查未成年人被侵害案件，应当依照法定程序，及时、全面收集固定证据。对于严重侵害未成年人的暴力犯罪案件、社会高度关注的重大、敏感案件，公安机关、人民检察院应当加强办案中的协商、沟通与配合。公安机关、人民检察院依法向报案人员或者单位调取指控犯罪所需要的处理记录、监控资料、证人证言等证据时，相关单位及其工作人员应当积极予以协助配合，并按照有关规定全面提供。",
    ),
  ],
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
};

export const FAMILY_MINOR_SOURCES: LegalSourceRecord[] = [
  CRIMINAL_LAW,
  PUBLIC_SECURITY_PUNISHMENTS_LAW,
  CIVIL_CODE,
  ANTI_DOMESTIC_VIOLENCE_LAW,
  MINORS_PROTECTION_LAW,
  MANDATORY_REPORT_OPINION,
];

export const DOMESTIC_VIOLENCE_FOCUS_ID = "focus-family-domestic-violence";
export const MINOR_HARM_FOCUS_ID = "focus-family-minor-harm";

export const REQUIRED_FAMILY_MINOR_CASE_FOCUS_IDS = [
  DOMESTIC_VIOLENCE_FOCUS_ID,
  MINOR_HARM_FOCUS_ID,
] as const;

const DOMESTIC_VIOLENCE_FOCUS: CaseFocusSeed = {
  caseFocusId: DOMESTIC_VIOLENCE_FOCUS_ID,
  version: "1.0.0",
  contentStatus: "trial",
  title: "家庭暴力及婚恋、家庭矛盾升级",
  region: "国家",
  summary:
    "家庭成员或者家庭成员以外共同生活的人之间的身体、精神侵害，以及婚恋、家庭矛盾持续升级的处置与分流。",
  match: { behaviorLabels: ["家庭暴力"] },
  elements: [
    "家庭成员与共同生活关系：核对双方是否属于家庭成员，或者属于家庭成员以外共同生活的人（参照反家庭暴力法第三十七条执行），不以称谓、婚恋关系或者同住事实直接认定家庭暴力。",
    "行为方式与持续性：核对殴打、捆绑、残害、限制人身自由以及经常性谩骂、恐吓等具体方式、次数和持续时间，不以单次冲突、情绪化表述或者家庭关系直接认定持续性家庭暴力。",
    "年龄与特殊保护：核对受害人是否属于未成年人、老年人、残疾人、孕期和哺乳期妇女、重病患者，分别适用特殊保护要求（反家庭暴力法第五条），不因家庭关系降低保护标准，也不因年龄描述直接认定紧急状态。",
    "程序分流：区分依法不给予治安管理处罚时的批评教育或者告诫书、依法给予治安管理处罚、依法追究刑事责任三种路径（反家庭暴力法第十六条、第三十三条），三种路径分别适用，不合并处理。",
    "人身安全保护：核对是否存在家庭暴力现实危险，提示告知受害人可以向人民法院申请人身安全保护令，以及无民事行为能力人、限制民事行为能力人由近亲属、公安机关、妇女联合会等代为申请的情形（反家庭暴力法第二十三条）；是否申请、是否签发由当事人和人民法院依法决定。",
    "婚恋与家庭矛盾升级：核对矛盾起因、是否持续升级、是否伴随跟踪、骚扰、纠缠、威胁等行为，区分一般婚恋家庭纠纷与需要及时干预的家庭暴力。",
    "证据固定：核对出警记录、告诫书、查访记录、伤情鉴定意见、诊疗记录和监控等证据的取得与保存情况（反家庭暴力法第十五条），提示可能灭失的证据。",
  ],
  diversionRules: [
    {
      diversion: "criminal",
      conditions: [
        "故意伤害他人身体致轻伤以上的，按刑法故意伤害罪方向审查。",
        "虐待家庭成员，情节恶劣的，按刑法虐待罪方向审查；致使被害人重伤、死亡的，依法从重处理。",
        "对年老、年幼、患病或者其他没有独立生活能力的人负有扶养义务而拒绝扶养，情节恶劣的，按刑法遗弃罪方向审查。",
      ],
      basis: [
        { sourceId: "src-cn-criminal-law", article: "第二百三十四条" },
        { sourceId: "src-cn-criminal-law", article: "第二百六十条" },
        { sourceId: "src-cn-criminal-law", article: "第二百六十一条" },
      ],
    },
    {
      diversion: "administrative",
      conditions: [
        "殴打他人或者故意伤害他人身体，尚未达到刑事追诉标准的，按治安管理处罚法方向审查。",
        "家庭暴力情节较轻，依法不给予治安管理处罚的，由公安机关对加害人给予批评教育或者出具告诫书，并依法送交、查访。",
        "因民间纠纷引起的打架斗殴等违反治安管理行为，情节较轻的，可以依法调解处理。",
      ],
      basis: [
        { sourceId: "src-cn-public-security-punishments", article: "第五十一条" },
        { sourceId: "src-cn-public-security-punishments", article: "第九条" },
        { sourceId: "src-cn-anti-domestic-violence-law", article: "第十六条" },
        { sourceId: "src-cn-anti-domestic-violence-law", article: "第十七条" },
      ],
    },
    {
      diversion: "civil",
      conditions: [
        "禁止家庭暴力，禁止家庭成员间的虐待和遗弃；因实施家庭暴力导致离婚的，无过错方有权请求损害赔偿。",
        "人身损害赔偿、医疗费等民事争议缺乏犯罪或者治安违法构成的，按民事侵权途径处理。",
      ],
      basis: [
        { sourceId: "src-cn-civil-code", article: "第一千零四十二条" },
        { sourceId: "src-cn-civil-code", article: "第一千零九十一条" },
        { sourceId: "src-cn-civil-code", article: "第一千一百七十九条" },
      ],
    },
  ],
  neighbors: [
    {
      neighborFocusId: ASSAULT_FOCUS_ID,
      name: "打架斗殴和伤害类案情",
      distinction:
        "家庭暴力以家庭成员或者家庭成员以外共同生活的人之间的关系为前提，并可能表现为持续性、控制性侵害；一般打架斗殴伤害以具体冲突过程和行为方式判断。两种情形分别评价，不因家庭关系直接提升或者降低处理。",
      decisiveFacts: ["双方是否属于家庭成员或者共同生活的人", "行为是否具有持续性和控制性", "伤情程度与行为方式"],
    },
    {
      neighborFocusId: MINOR_HARM_FOCUS_ID,
      name: "侵害未成年人及涉未成年人高风险案情",
      distinction:
        "家庭暴力同时涉及未成年人时，需要同时适用未成年人保护的特殊程序与保护要求；两种情形分别评价，不相互吸收。",
      decisiveFacts: ["受害人是否为未成年人及其实际年龄", "是否触发强制报告与未成年人特殊程序要求"],
    },
    {
      neighborFocusId: null,
      name: "一般婚恋、家庭纠纷与民事纠纷",
      distinction:
        "婚恋、家庭矛盾尚未出现殴打、威胁、跟踪、骚扰等具体行为的，应按纠纷调处或者民事途径处理，不因关系亲密直接作为违法犯罪处理。",
      decisiveFacts: ["是否存在具体侵害行为", "矛盾是否持续升级", "是否已造成人身或者财产损害"],
    },
  ],
  gaps: [
    {
      gapId: "gap-harm-result",
      description: "伤情或者精神损害后果尚未确认，无法判断家庭暴力的严重程度与刑事、行政分流方向。",
      factCategory: "result",
      affectsDiversions: ["criminal", "administrative"],
    },
    {
      gapId: "gap-frequency",
      description: "家庭暴力是否多次、持续或者升级尚未确认，无法判断是否属于情节恶劣或者面临现实危险。",
      factCategory: "count",
      affectsDiversions: ["criminal", "administrative"],
    },
    {
      gapId: "gap-dwelling",
      description: "双方是否共同居住、行为发生场所尚未确认，影响人身安全保护与出警处置判断。",
      factCategory: "place",
      affectsDiversions: ["criminal", "administrative"],
    },
  ],
  highRiskBoundary: [
    "出现正在发生的人身危险、持械威胁、跟踪骚扰升级或者证据灭失风险时，应在完整报告前提示人工核验，不自动作出处置决定。",
    "涉及未成年人、老年人、残疾人、孕期和哺乳期妇女、重病患者时，应优先核实特殊保护与救助要求，并按反家庭暴力法第十四条、第十五条提示报告、协助就医与鉴定。",
    "是否出具告诫书、是否给予治安管理处罚、是否追究刑事责任、是否申请人身安全保护令，均由民警和有权机关依法人工判断，系统不得自动决定。",
  ],
  sourceIds: [
    "src-cn-criminal-law",
    "src-cn-public-security-punishments",
    "src-cn-civil-code",
    "src-cn-anti-domestic-violence-law",
    "src-cn-minors-protection-law",
  ],
  scenarios: [
    {
      scenarioId: "domestic-violence-typical",
      kind: "typical",
      title: "典型场景：多次殴打配偶致轻微伤",
      caseText: "4月1日晚上，王某在某某小区家中多次殴打其妻子李某，致李某轻微伤。",
      expectedCaseFocusIds: [DOMESTIC_VIOLENCE_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "domestic-violence-adjacent-boundary",
      kind: "adjacent_boundary",
      title: "相邻反例：仅有离婚财产分歧，无具体侵害行为",
      caseText: "4月3日，赵某与钱某因离婚后的财产分割产生分歧，双方到派出所咨询。",
      expectedCaseFocusIds: [],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "domestic-violence-decisive-gap",
      kind: "decisive_gap",
      title: "决定性事实缺失：伤情、次数与场所均未确认",
      caseText: "4月1日晚上，王某殴打其妻子李某。",
      expectedCaseFocusIds: [DOMESTIC_VIOLENCE_FOCUS_ID],
      expectedReportStatus: "insufficient_facts",
      expectedUnresolvedGapIds: ["gap-harm-result", "gap-frequency", "gap-dwelling"],
    },
    {
      scenarioId: "domestic-violence-high-risk-boundary",
      kind: "high_risk_boundary",
      title: "高风险边界：家庭暴力升级并伴随持刀威胁、医疗需要与证据灭失",
      caseText:
        "4月1日晚上，王某在某某小区家中多次家暴其妻子李某，致李某轻微伤。李某受伤后已送医治疗。王某持刀扬言报复李某。李某称王某曾威胁删除监控记录。",
      expectedCaseFocusIds: [DOMESTIC_VIOLENCE_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "domestic-violence-source-invalidation",
      kind: "source_invalidation",
      title: "法源失效：到期、撤回、状态不明或紧急禁用",
      caseText: "4月1日晚上，王某在某某小区家中多次殴打其妻子李某，致李某轻微伤。",
      expectedCaseFocusIds: [DOMESTIC_VIOLENCE_FOCUS_ID],
      expectedReportStatus: "basis_unavailable",
      expectedUnresolvedGapIds: [],
    },
  ],
  draftedAt: "2026-09-22T00:00:00.000Z",
  verifiedAt: VERIFIED_AT,
  publishedAt: "2026-09-29T00:00:00.000Z",
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
  changeNote: "初次发布家庭与未成年人高风险重点案情：家庭暴力及婚恋、家庭矛盾升级。",
  sourceVerificationNote:
    "反家庭暴力法、刑法、治安管理处罚法与民法典条款已核对；是否属于家庭成员或者共同生活的人、伤情程度、是否持续升级均须民警结合证据人工核验，不得由系统推定。",
  withdrawalNote: null,
};

const MINOR_HARM_FOCUS: CaseFocusSeed = {
  caseFocusId: MINOR_HARM_FOCUS_ID,
  version: "1.0.0",
  contentStatus: "trial",
  title: "侵害未成年人及涉未成年人高风险案情",
  region: "国家",
  summary:
    "虐待、遗弃、性侵害、猥亵、拐卖、拐骗等侵害未成年人行为，以及强制报告、合适成年人到场、女性工作人员、同步录音录像、临时监护与撤销监护人资格等特殊程序与保护要求。",
  match: {
    behaviorLabels: ["侵害未成年人", "性侵害", "拐卖儿童"],
    requireAnyHints: [
      "未成年",
      "儿童",
      "幼女",
      "幼童",
      "幼儿",
      "婴儿",
      "学生",
      "孩子",
      "养子女",
      "继子女",
      "不满十四",
      "不满十八",
    ],
  },
  elements: [
    "年龄与身份：核对涉事未成年人的实际年龄、是否不满十四周岁、是否在校学生或者处于监护、看护关系之下；年龄直接影响程序要求、从重情节和保护措施，不以“孩子”“幼女”“学生”等描述直接认定。",
    "行为类型：分别核对虐待、遗弃、性侵害、猥亵、拐卖、拐骗、收买、组织或者利用未成年人乞讨、盗窃等具体行为，分别评价，不合并为一个主结论。",
    "监护与看护职责：核对父母或者其他监护人是否存在虐待、遗弃、非法送养、实施家庭暴力等禁止行为（未成年人保护法第十七条），不以监护关系直接认定或者免除责任。",
    "强制报告：核对密切接触未成年人行业的单位及其工作人员在工作中发现未成年人遭受或者疑似遭受不法侵害、面临不法侵害危险时，是否立即向公安机关报案或者举报（未成年人保护法第十一条，强制报告意见第二条、第四条），报告义务不因家庭关系或者内部处理而免除。",
    "程序与人员角色：分别适用讯问未成年犯罪嫌疑人、被告人，询问未成年被害人、证人的到场要求；依法通知法定代理人或者其成年亲属、所在学校代表等合适成年人到场（未成年人保护法第一百一十条）；办理涉及未成年人案件的专门机构或者专门人员中应当有女性工作人员（第一百零一条）；性侵害或者暴力伤害案件询问未成年被害人、证人应当同步录音录像、尽量一次完成，女性未成年人由女性工作人员进行（第一百一十二条）。上述规则分别适用，不得相互替代或者合并。",
    "保护与安置：核对是否需要临时监护、紧急安置、心理干预、经济救助、法律援助、转学安置等保护措施（未成年人保护法第九十二条、第一百一十一条）；是否采取由有权机关依法决定。",
    "监护人资格：核对是否存在严重损害未成年人身心健康等情形，提示人民法院可以依法撤销监护人资格并另行指定监护人（民法典第三十六条、未成年人保护法第一百零八条、反家庭暴力法第二十一条）。",
    "证据固定：核对伤情、就诊记录、影像资料、电子数据和强制报告记录等证据的取得与保存情况，提示可能灭失或者需要同步录音录像固定的证据。",
  ],
  diversionRules: [
    {
      diversion: "criminal",
      conditions: [
        "虐待未成年家庭成员，情节恶劣的，按刑法虐待罪方向审查；对未成年人负有监护、看护职责的人虐待被监护、看护的未成年人，情节恶劣的，按刑法第二百六十条之一方向审查。",
        "故意伤害未成年人身体致轻伤以上的，按刑法故意伤害罪方向审查。",
        "猥亵儿童的，按刑法猥亵儿童罪方向审查；奸淫不满十四周岁幼女的，以强奸论并从重处罚。",
        "拐卖儿童的，按刑法拐卖儿童罪方向审查；收买被拐卖的儿童的，按收买被拐卖的儿童罪方向审查；拐骗不满十四周岁未成年人脱离家庭或者监护人的，按拐骗儿童罪方向审查。",
        "对年幼、没有独立生活能力的人负有扶养义务而拒绝扶养，情节恶劣的，按刑法遗弃罪方向审查。",
      ],
      basis: [
        { sourceId: "src-cn-criminal-law", article: "第二百六十条" },
        { sourceId: "src-cn-criminal-law", article: "第二百六十条之一" },
        { sourceId: "src-cn-criminal-law", article: "第二百三十四条" },
        { sourceId: "src-cn-criminal-law", article: "第二百三十七条" },
        { sourceId: "src-cn-criminal-law", article: "第二百三十六条" },
        { sourceId: "src-cn-criminal-law", article: "第二百四十条" },
        { sourceId: "src-cn-criminal-law", article: "第二百四十一条" },
        { sourceId: "src-cn-criminal-law", article: "第二百六十二条" },
        { sourceId: "src-cn-criminal-law", article: "第二百六十一条" },
      ],
    },
    {
      diversion: "administrative",
      conditions: [
        "殴打、故意伤害他人身体，尚未达到刑事追诉标准的，按治安管理处罚法方向审查；殴打、伤害不满十四周岁的人的，依法从重。",
        "父母或者其他监护人实施虐待、遗弃、非法送养未成年人或者对未成年人实施家庭暴力的，依法处理并通报有关部门。",
        "密切接触未成年人行业的单位及其工作人员未履行强制报告义务，造成严重后果的，依法给予处分。",
      ],
      basis: [
        { sourceId: "src-cn-public-security-punishments", article: "第五十一条" },
        { sourceId: "src-cn-public-security-punishments", article: "第九条" },
        { sourceId: "src-cn-minors-protection-law", article: "第十七条" },
        { sourceId: "src-cn-minors-protection-law", article: "第十一条" },
        { sourceId: "src-cn-mandatory-report-opinion", article: "第二条" },
      ],
    },
    {
      diversion: "civil",
      conditions: [
        "监护人实施严重损害被监护人身心健康等行为的，人民法院可以依法撤销其监护人资格，安排必要的临时监护措施并另行指定监护人。",
        "未成年人遭受性侵害的损害赔偿请求权的诉讼时效期间，自受害人年满十八周岁之日起计算。",
        "人身损害赔偿、医疗费等民事争议缺乏犯罪或者治安违法构成的，按民事侵权途径处理。",
      ],
      basis: [
        { sourceId: "src-cn-civil-code", article: "第三十六条" },
        { sourceId: "src-cn-civil-code", article: "第一百九十一条" },
        { sourceId: "src-cn-civil-code", article: "第一千一百七十九条" },
      ],
    },
  ],
  neighbors: [
    {
      neighborFocusId: DOMESTIC_VIOLENCE_FOCUS_ID,
      name: "家庭暴力及婚恋、家庭矛盾升级",
      distinction:
        "同样发生在家庭内部的侵害行为，需要先核实被侵害人是否为未成年人；涉及未成年人时适用强制报告、合适成年人到场、同步录音录像等特殊要求，两种情形分别评价。",
      decisiveFacts: ["被侵害人的实际年龄", "是否属于未成年人", "是否触发未成年人特殊程序要求"],
    },
    {
      neighborFocusId: ASSAULT_FOCUS_ID,
      name: "打架斗殴和伤害类案情",
      distinction:
        "被侵害人是否为未成年人决定程序、人员与保护要求；涉及未成年人的伤害案情应单独适用未成年人保护规则，不因行为方式相同而合并评价。",
      decisiveFacts: ["被侵害人是否未成年人及其年龄", "是否属于监护人、看护人或者其他特定关系人", "伤情程度与行为方式"],
    },
    {
      neighborFocusId: null,
      name: "成年人之间的虐待、遗弃、性侵害或者拐卖（清单外）",
      distinction:
        "被侵害人是否为未成年人，决定程序、人员、保护措施与从重情节不同；成年人之间的同类行为按对应罪名或者违法行为单独审查，不套用未成年人保护程序。",
      decisiveFacts: ["被侵害人的实际年龄", "是否属于未成年人", "是否适用未成年人特殊程序"],
    },
  ],
  gaps: [
    {
      gapId: "gap-harm-result",
      description: "未成年人的伤情、身心损害后果尚未确认，无法判断侵害程度与保护、救助的优先顺序。",
      factCategory: "result",
      affectsDiversions: ["criminal", "administrative"],
    },
    {
      gapId: "gap-age",
      description: "涉事未成年人的实际年龄尚未确认，无法判断是否不满十四周岁以及相应的程序与从重情节。",
      factCategory: "age",
      affectsDiversions: ["criminal", "administrative"],
    },
    {
      gapId: "gap-repeat",
      description: "侵害行为是否多次、持续或者涉及多人尚未确认，无法判断是否属于情节恶劣或者面临持续危险。",
      factCategory: "count",
      affectsDiversions: ["criminal", "administrative"],
    },
  ],
  highRiskBoundary: [
    "出现正在发生的人身危险、性侵害或者暴力伤害风险、未成年人无人照料或者面临人身安全威胁、证据灭失风险时，应在完整报告前提示人工核验，不自动作出处置决定。",
    "涉及未成年人时，应优先核实强制报告、合适成年人到场、女性工作人员、同步录音录像、临时监护与紧急安置等要求，并由民警人工判断具体适用。",
    "是否受案、立案、采取保护措施、撤销监护人资格或者移送有关部门，均由民警和有权机关依法人工判断，系统不得自动决定。",
  ],
  sourceIds: [
    "src-cn-criminal-law",
    "src-cn-public-security-punishments",
    "src-cn-civil-code",
    "src-cn-anti-domestic-violence-law",
    "src-cn-minors-protection-law",
    "src-cn-mandatory-report-opinion",
  ],
  scenarios: [
    {
      scenarioId: "minor-harm-typical",
      kind: "typical",
      title: "典型场景：多次殴打未成年子女致轻微伤",
      caseText: "5月2日，李某在某某小区家中多次殴打其13岁的未成年女儿，致其轻微伤。",
      expectedCaseFocusIds: [MINOR_HARM_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "minor-harm-adjacent-boundary",
      kind: "adjacent_boundary",
      title: "相邻反例：成年人之间的工作分歧，无涉未成年人侵害",
      caseText: "5月5日，某培训机构的两名成年教师因排课问题交换意见，现场有成年学员在场。",
      expectedCaseFocusIds: [],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "minor-harm-decisive-gap",
      kind: "decisive_gap",
      title: "决定性事实缺失：年龄、伤情与次数均未确认",
      caseText: "5月2日，李某殴打其未成年女儿。",
      expectedCaseFocusIds: [MINOR_HARM_FOCUS_ID],
      expectedReportStatus: "insufficient_facts",
      expectedUnresolvedGapIds: ["gap-harm-result", "gap-age", "gap-repeat"],
    },
    {
      scenarioId: "minor-harm-high-risk-boundary",
      kind: "high_risk_boundary",
      title: "高风险边界：侵害未成年人并伴随医疗需要与证据灭失",
      caseText:
        "5月2日，李某在某某小区家中多次殴打其13岁的未成年女儿，致其轻微伤。未成年女儿受伤后已送医治疗。李某威胁删除伤情照片。",
      expectedCaseFocusIds: [MINOR_HARM_FOCUS_ID],
      expectedReportStatus: "complete",
      expectedUnresolvedGapIds: [],
    },
    {
      scenarioId: "minor-harm-source-invalidation",
      kind: "source_invalidation",
      title: "法源失效：到期、撤回、状态不明或紧急禁用",
      caseText: "5月2日，李某在某某小区家中多次殴打其13岁的未成年女儿，致其轻微伤。",
      expectedCaseFocusIds: [MINOR_HARM_FOCUS_ID],
      expectedReportStatus: "basis_unavailable",
      expectedUnresolvedGapIds: [],
    },
  ],
  draftedAt: "2026-09-22T00:00:00.000Z",
  verifiedAt: VERIFIED_AT,
  publishedAt: "2026-09-29T00:00:00.000Z",
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
  changeNote: "初次发布家庭与未成年人高风险重点案情：侵害未成年人及涉未成年人高风险案情。",
  sourceVerificationNote:
    "未成年人保护法、刑法、民法典、反家庭暴力法与强制报告意见条款已核对；年龄、监护与看护关系、是否触发强制报告和同步录音录像均须民警结合证据人工核验，不得由系统推定。",
  withdrawalNote: null,
};

const CASE_FOCUS_SEEDS: CaseFocusSeed[] = [DOMESTIC_VIOLENCE_FOCUS, MINOR_HARM_FOCUS];

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

export const FAMILY_MINOR_CASE_FOCUSES: CaseFocusRecord[] =
  CASE_FOCUS_SEEDS.map(withScenarioTestResults);

/** 每次调用返回全新的可重置内容副本，避免测试之间共享可变状态。 */
export function createFamilyMinorCaseFocuses(): CaseFocusRecord[] {
  return FAMILY_MINOR_CASE_FOCUSES.map(cloneCaseFocus);
}

export function createFamilyMinorSources(): LegalSourceRecord[] {
  return cloneLegalSources(FAMILY_MINOR_SOURCES);
}
