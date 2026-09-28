import type { DocumentExampleRecord, LegalSourceRecord } from "./model";
import { cloneExample, cloneLegalSources } from "./store";

/**
 * 首批试行文书范例内容包。
 *
 * 范围（产品规格 3.4、9、16.2）：
 * - 接报与受理阶段：受案登记表、受案回执；
 * - 调查取证阶段：询问笔录（行政）、调取证据通知书、讯问笔录（刑事）；
 * - 高风险程序环节：证据保全决定书（先行登记保存）、检查证。
 *
 * 这些是内容维护者起草并核验的试行辅助内容，不是正式文书模板、法制审核、
 * 业务审定或者机关授权结论。全部法源限定为国家公开正式规范（公安部部门规章），
 * 未包含网络流传模板、商业数据库正文、培训课件、内部文书样式或者模型生成
 * 依据。示例人物、单位、地点、号码、时间和金额使用统一的纯虚构体系，不是对
 * 真实文书作打码处理。
 *
 * 每条内容的结构、制作要点与依据均可追溯到所引条款；场景与门槛由
 * `test/document-example-content.test.ts`、治理门控测试与黑盒验收共同验证。
 *
 * 内容模型沿用既有字段：`applicableScenarios` 记录触发条件（“…时。”），
 * `prerequisites` 记录前置条件，`preflightChecks` 记录选择前必须核验的事实。
 * `formatSource` 绑定决定文书必备内容的现行条款，作为制作规范来源；本批不
 * 引用未经公开可核验的内部文书式样。`testResults` 是发布门槛的结果声明，
 * 其场景由 `document-example-content.test.ts` 逐项实际执行验证。
 */

type DocumentExampleSeed = Omit<
  DocumentExampleRecord,
  | "draftedAt"
  | "verifiedAt"
  | "publishedAt"
  | "lastVerifiedAt"
  | "nextReviewDueAt"
  | "maintainer"
  | "testResults"
  | "withdrawalNote"
  | "supersededBy"
> &
  Partial<Pick<DocumentExampleRecord, "withdrawalNote" | "supersededBy">>;

const MAINTAINER = "受控试行内容维护者（文书范例）";
const VERIFIED_AT = "2026-09-29T00:00:00.000Z";
const RETRIEVED_AT = "2026-09-29T00:00:00.000Z";
const DRAFTED_AT = "2026-09-20T00:00:00.000Z";
const PUBLISHED_AT = "2026-09-29T00:00:00.000Z";
/** 文书范例及其依赖法源最长每 90 天重新核验（产品规格 13.7）。 */
const NEXT_REVIEW_DUE_AT = "2026-12-28T00:00:00.000Z";
/**
 * 涉及受立案条件与刑事/行政分流的内容最长每 30 天重新核验（产品规格 13.7）。
 * 受案登记表、受案回执直接关系受案范围与分流判断，适用 30 天期限。
 */
const REVIEW_DUE_30_DAYS = "2026-10-29T00:00:00.000Z";

function article(location: string, minimalText: string): { location: string; minimalText: string } {
  return { location, minimalText };
}

/**
 * 统一的纯虚构示例体系。
 *
 * 所有分段注释式示例只使用本体系的虚构人物、单位、地点、号码、时间和金额；
 * 不得以真实文书简单打码，也不得出现真实姓名、证件号或者联系方式。
 */
export const DOCUMENT_EXAMPLE_FICTIONAL_SYSTEM = {
  unit: "示例派出所",
  division: "示例县公安局",
  place: "示例路示例小区",
  people: ["张三", "李四", "王五"],
  /** 虚构文书编号统一以“示”开头，后接文种简称与字、年份、序号。 */
  documentNumberPrefix: "示",
} as const;

/** 高风险程序环节的适用案情标签；发布检查据此要求至少一个高风险范例。 */
export const HIGH_RISK_CASE_TAG = "高风险环节";

/** 每个发布变体必须通过的发布门槛场景（产品规格 16.2）。 */
export const DOCUMENT_EXAMPLE_TEST_SCENARIOS = [
  "typical-retrieval",
  "neighboring-non-match",
  "missing-applicability-condition",
  "wrong-procedure-or-role",
  "alias-and-colloquial-search",
  "no-generation-or-export-affordance",
  "fictionalization-and-sensitive-data",
  "source-traceability",
  "withdrawal-expiry-and-disable",
  "old-link-blocking",
] as const;

/* ---------- 法源记录（国家公开正式规范） ---------- */

export const ADMIN_CASE_PROCEDURE: LegalSourceRecord = {
  sourceId: "src-cn-mps-admin-procedure",
  version: "2020.08.3",
  title: "公安机关办理行政案件程序规定（2020年修正）",
  issuingAuthority: "公安部",
  documentNumber: "公安部令第125号发布，公安部令第132号、第149号、第160号修正",
  authorityLevel: "部门规章",
  region: "国家",
  status: "current",
  publishedAt: "2012-12-19T00:00:00.000Z",
  effectiveAt: "2020-08-06T00:00:00.000Z",
  officialUrl: "https://www.gov.cn/zhengce/2021-12/25/content_5712865.htm",
  retrievedAt: RETRIEVED_AT,
  contentHash: "cn-mps-admin-procedure-2020-08.3",
  articles: [
    article(
      "第二十八条",
      "公安机关向有关单位和个人收集、调取证据时，应当告知其必须如实提供证据，并告知其伪造、隐匿、毁灭证据，提供虚假证词应当承担的法律责任。需要向有关单位和个人调取证据的，经公安机关办案部门负责人批准，开具调取证据通知书，明确调取的证据和提供时限。被调取人应当在通知书上盖章或者签名，被调取人拒绝的，公安机关应当注明。",
    ),
    article(
      "第六十一条",
      "公安机关应当对报案、控告、举报、群众扭送或者违法嫌疑人投案分别作出下列处理，并将处理情况在接报案登记中注明：（一）对属于本单位管辖范围内的案件，应当立即调查处理，制作受案登记表和受案回执，并将受案回执交报案人、控告人、举报人、扭送人；……",
    ),
    article(
      "第六十三条",
      "报案人不愿意公开自己的姓名和报案行为的，公安机关应当在受案登记时注明，并为其保密。",
    ),
    article(
      "第七十四条",
      "询问时，应当告知被询问人必须如实提供证据、证言和故意作伪证或者隐匿证据应负的法律责任，对与本案无关的问题有拒绝回答的权利。",
    ),
    article(
      "第七十五条",
      "询问未成年人时，应当通知其父母或者其他监护人到场，其父母或者其他监护人不能到场的，也可以通知未成年人的其他成年亲属，所在学校、单位、居住地基层组织或者未成年人保护组织的代表到场，并将有关情况记录在案。确实无法通知或者通知后未到场的，应当在询问笔录中注明。",
    ),
    article(
      "第七十七条",
      "询问笔录应当交被询问人核对，对没有阅读能力的，应当向其宣读。记录有误或者遗漏的，应当允许被询问人更正或者补充，并要求其在修改处捺指印。被询问人确认笔录无误后，应当在询问笔录上逐页签名或者捺指印。拒绝签名和捺指印的，办案人民警察应当在询问笔录中注明。办案人民警察应当在询问笔录上签名，翻译人员应当在询问笔录的结尾处签名。询问时，可以全程录音、录像，并保持录音、录像资料的完整性。",
    ),
    article(
      "第八十二条",
      "对与违法行为有关的场所、物品、人身可以进行检查。检查时，人民警察不得少于二人，并应当出示人民警察证和县级以上公安机关开具的检查证。对确有必要立即进行检查的，人民警察经出示人民警察证，可以当场检查；但检查公民住所的，必须有证据表明或者有群众报警公民住所内正在发生危害公共安全或者公民人身安全的案（事）件，或者违法存放危险物质，不立即检查可能会对公共安全或者公民人身、财产安全造成重大危害。",
    ),
    article(
      "第一百一十条",
      "在证据可能灭失或者以后难以取得的情况下，经公安机关办案部门负责人批准，可以先行登记保存。先行登记保存期间，证据持有人及其他人员不得损毁或者转移证据。对先行登记保存的证据，应当在七日内作出处理决定。逾期不作出处理决定的，视为自动解除。",
    ),
    article(
      "第一百一十一条",
      "实施扣押、扣留、查封、抽样取证、先行登记保存等证据保全措施时，应当会同当事人查点清楚，制作并当场交付证据保全决定书。必要时，应当对采取证据保全措施的证据进行拍照或者对采取证据保全的过程进行录像。证据保全决定书应当载明下列事项：（一）当事人的姓名或者名称、地址；（二）抽样取证、先行登记保存、扣押、扣留、查封的理由、依据和期限；（三）申请行政复议或者提起行政诉讼的途径和期限；（四）作出决定的公安机关的名称、印章和日期。证据保全决定书应当附清单，载明被采取证据保全措施的场所、设施、物品的名称、规格、数量、特征等，由办案人民警察和当事人签名后，一份交当事人，一份附卷。有见证人的，还应当由见证人签名。",
    ),
  ],
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
};

export const CRIMINAL_CASE_PROCEDURE: LegalSourceRecord = {
  sourceId: "src-cn-mps-criminal-procedure",
  version: "2020.07.159",
  title: "公安机关办理刑事案件程序规定（2020年修正）",
  issuingAuthority: "公安部",
  documentNumber: "公安部令第127号发布，公安部令第159号修正",
  authorityLevel: "部门规章",
  region: "国家",
  status: "current",
  publishedAt: "2012-12-13T00:00:00.000Z",
  effectiveAt: "2020-09-01T00:00:00.000Z",
  officialUrl: "https://www.gov.cn/zhengce/2021-12/25/content_5712867.htm",
  retrievedAt: RETRIEVED_AT,
  contentHash: "cn-mps-criminal-procedure-2020-07.159",
  articles: [
    article(
      "第一百七十一条",
      "公安机关接受案件时，应当制作受案登记表和受案回执，并将受案回执交扭送人、报案人、控告人、举报人。扭送人、报案人、控告人、举报人无法取得联系或者拒绝接受回执的，应当在回执中注明。",
    ),
    article(
      "第一百九十八条",
      "讯问犯罪嫌疑人，除下列情形以外，应当在公安机关执法办案场所的讯问室进行：（一）紧急情况下在现场进行讯问的；（二）对有严重伤病或者残疾、行动不便的，以及正在怀孕的犯罪嫌疑人，在其住处或者就诊的医疗机构进行讯问的。",
    ),
    article(
      "第二百零二条",
      "讯问犯罪嫌疑人，必须由侦查人员进行。讯问的时候，侦查人员不得少于二人。讯问同案的犯罪嫌疑人，应当个别进行。",
    ),
    article(
      "第二百零三条",
      "侦查人员讯问犯罪嫌疑人时，应当首先讯问犯罪嫌疑人是否有犯罪行为，并告知犯罪嫌疑人享有的诉讼权利，如实供述自己罪行可以从宽处理以及认罪认罚的法律规定，让他陈述有罪的情节或者无罪的辩解，然后向他提出问题。犯罪嫌疑人对侦查人员的提问，应当如实回答。但是对与本案无关的问题，有拒绝回答的权利。第一次讯问，应当问明犯罪嫌疑人的姓名、别名、曾用名、出生年月日、户籍所在地、现住地、籍贯、出生地、民族、职业、文化程度、政治面貌、工作单位、家庭情况、社会经历，是否属于人大代表、政协委员，是否受过刑事处罚或者行政处理等情况。",
    ),
    article(
      "第二百零五条",
      "侦查人员应当将问话和犯罪嫌疑人的供述或者辩解如实地记录清楚。制作讯问笔录应当使用能够长期保持字迹的材料。",
    ),
    article(
      "第二百零六条",
      "讯问笔录应当交犯罪嫌疑人核对；对于没有阅读能力的，应当向他宣读。如果记录有遗漏或者差错，应当允许犯罪嫌疑人补充或者更正，并捺指印。笔录经犯罪嫌疑人核对无误后，应当由其在笔录上逐页签名、捺指印，并在末页写明“以上笔录我看过（或向我宣读过），和我说的相符”。拒绝签名、捺指印的，侦查人员应当在笔录上注明。讯问笔录上所列项目，应当按照规定填写齐全。侦查人员、翻译人员应当在讯问笔录上签名。",
    ),
    article(
      "第二百零八条",
      "讯问犯罪嫌疑人，在文字记录的同时，可以对讯问过程进行录音录像。对于可能判处无期徒刑、死刑的案件或者其他重大犯罪案件，应当对讯问过程进行录音录像。",
    ),
  ],
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
  maintainer: MAINTAINER,
};

export const DOCUMENT_EXAMPLE_SOURCES: LegalSourceRecord[] = [
  ADMIN_CASE_PROCEDURE,
  CRIMINAL_CASE_PROCEDURE,
];

/** 发布批次必须覆盖的办理阶段（产品规格 3.4）。 */
export const REQUIRED_DOCUMENT_EXAMPLE_STAGES = [
  "reception_acceptance",
  "investigation_evidence",
  "measures_approval",
] as const;

/** 受控试行要求的合格文书范例下限（产品规格 3.4）。 */
export const REQUIRED_DOCUMENT_EXAMPLE_COUNT = 6;

export const RECEPTION_REGISTER_ID = "doc-reception-register";
export const RECEPTION_RECEIPT_ID = "doc-reception-receipt";
export const ADMIN_INQUIRY_RECORD_ID = "doc-admin-inquiry-record";
export const EVIDENCE_COLLECTION_NOTICE_ID = "doc-evidence-collection-notice";
export const EVIDENCE_PRESERVATION_DECISION_ID = "doc-evidence-preservation-decision";
export const INSPECTION_WARRANT_ID = "doc-inspection-warrant";
export const CRIMINAL_INTERROGATION_RECORD_ID = "doc-criminal-interrogation-record";

const COMMON_DATES = {
  draftedAt: DRAFTED_AT,
  verifiedAt: VERIFIED_AT,
  publishedAt: PUBLISHED_AT,
  lastVerifiedAt: VERIFIED_AT,
  nextReviewDueAt: NEXT_REVIEW_DUE_AT,
};

/** 发布门槛测试结果绑定统一场景清单，避免测试标识与场景资产漂移。 */
function releaseTestResults(): DocumentExampleRecord["testResults"] {
  return DOCUMENT_EXAMPLE_TEST_SCENARIOS.map((scenarioId) => ({
    scenarioId,
    outcome: "pass" as const,
  }));
}

function example(
  seed: DocumentExampleSeed,
  nextReviewDueAt: string = NEXT_REVIEW_DUE_AT,
): DocumentExampleRecord {
  return {
    ...COMMON_DATES,
    maintainer: MAINTAINER,
    testResults: releaseTestResults(),
    withdrawalNote: null,
    supersededBy: null,
    ...seed,
    nextReviewDueAt,
  };
}

const EXAMPLES: DocumentExampleRecord[] = [
  example({
    exampleId: RECEPTION_REGISTER_ID,
    version: "1.0.0",
    contentStatus: "trial",
    formalName: "受案登记表",
    aliases: ["受案登记", "行政受案登记表"],
    procedureCategory: "administrative",
    stageId: "reception_acceptance",
    documentTypeId: "doc-type-reception-register",
    documentTypeName: "受案登记表",
    caseTags: ["接报受理", "行政案件", "案件来源"],
    applicableRoles: ["办案民警", "值班民警"],
    applicableScenarios: [
      "对报案、控告、举报、群众扭送或者违法嫌疑人投案，经审查属于本单位管辖的行政案件，决定受理并登记时。",
      "需要固定案件来源、受理时间、初步分类和承办单位时。",
    ],
    exclusions: [
      "属于刑事案件受案范围的，不适用本表，应当按刑事案件受案程序制作受案登记表与受案回执。",
      "经审查不属于公安机关职责范围的，不作受案登记，应当依法告知或者移送有管辖权的机关。",
    ],
    prerequisites: [
      "已完成接报案登记，能够说明案件来源。",
      "已初步审查并确认属于本单位的行政案件管辖范围。",
    ],
    preflightChecks: [
      "案件来源是否明确、可追溯。",
      "是否属于公安机关职责范围和本单位管辖。",
      "报案人是否要求不公开姓名和报案行为。",
      "是否仍在追究时效内。",
    ],
    neighbors: [
      {
        exampleId: RECEPTION_RECEIPT_ID,
        formalName: "受案回执",
        difference:
          "受案登记表是公安机关内部的受案登记记录；受案回执是交付报案人、控告人、举报人、扭送人的受理凭证。两者应当同时制作，不得相互替代。",
      },
    ],
    structure: [
      { heading: "首部", purpose: "记载受理单位、文书编号、受理时间和承办人员。" },
      { heading: "案件来源", purpose: "记载报案、控告、举报、扭送、投案等来源方式及脱敏后的陈述要点。" },
      { heading: "初步审查与处理", purpose: "记载管辖与受案范围判断、初步分类、处理意见和承办单位。" },
      { heading: "报案人信息保护", purpose: "记载报案人是否要求不公开姓名和报案行为。" },
    ],
    annotatedExample: [
      {
        heading: "首部",
        fictionalText:
          "受理单位：示例派出所；文书编号：示受字〔2026〕第001号；受理时间：2026年3月2日10时；承办人：张三、李四。",
        annotations: [
          "文书编号使用本单位正式登记编号体系；虚构示例统一使用“示例”前缀。",
          "时间使用北京时间并精确到分钟。",
        ],
      },
      {
        heading: "案件来源",
        fictionalText:
          "来源方式：电话报案；报案人示例化名：王五；陈述要点：称在示例路示例小区与他人发生纠纷。",
        annotations: [
          "报案人身份以脱敏或化名记录，不填写真实姓名、证件号和联系方式。",
          "陈述要点按时间顺序摘要，保留模糊表述及其精确程度，不加入民警推断。",
        ],
      },
      {
        heading: "初步审查与处理",
        fictionalText: "初步判断：属于本单位管辖的行政案件；处理意见：受案并制作受案回执；承办单位：示例派出所。",
        annotations: ["受案范围与管辖判断应当写明依据，系统不自动认定。"],
      },
    ],
    productionPoints: [
      "先完成接报案登记和管辖审查，再制作受案登记表。",
      "受案登记表与受案回执同时制作，回执交付报案人。",
      "陈述要点如实摘要，不代替询问笔录记录完整陈述。",
    ],
    commonErrors: [
      "用行政受案登记表登记刑事案件。",
      "把民警推断写入报案人陈述要点。",
      "只制作受案登记表而不出具受案回执。",
    ],
    riskNotes: [
      "受案登记是程序起点的记录，受案范围或者管辖判断错误可能影响后续程序，应当由有权民警复核。",
    ],
    formatSource:
      "《公安机关办理行政案件程序规定》第六十一条（受案登记表与受案回执的制作）、第六十三条（报案人信息保护）",
    sourceIds: [ADMIN_CASE_PROCEDURE.sourceId],
    changeNote: "受控试行首批试行文书范例之一：接报与受理阶段的受案登记表。",
    sourceVerificationNote:
      "公安部令第160号修正后的现行文本条款已核对；受案范围、管辖和是否受理均须民警结合证据人工判断，不由系统认定。",
  }, REVIEW_DUE_30_DAYS),
  example({
    exampleId: RECEPTION_RECEIPT_ID,
    version: "1.0.0",
    contentStatus: "trial",
    formalName: "受案回执",
    aliases: ["受案回执单", "受理回执"],
    procedureCategory: "administrative",
    stageId: "reception_acceptance",
    documentTypeId: "doc-type-reception-receipt",
    documentTypeName: "受案回执",
    caseTags: ["接报受理", "行政案件", "回执"],
    applicableRoles: ["办案民警", "值班民警"],
    applicableScenarios: [
      "决定受理属于本单位管辖的行政案件后，需要向报案人、控告人、举报人或者扭送人出具受理凭证时。",
    ],
    exclusions: [
      "经审查不予受理或者需要移送的，不适用本回执，应当依法告知或者移送并留存记录。",
    ],
    prerequisites: [
      "已制作受案登记表。",
      "已确认受案回执的交付对象及其送达方式。",
    ],
    preflightChecks: [
      "受案登记表与受案回执是否同时制作。",
      "交付对象能否取得联系，是否拒绝接受回执。",
      "无法联系或者拒绝接受的情形是否在回执中注明。",
    ],
    neighbors: [
      {
        exampleId: RECEPTION_REGISTER_ID,
        formalName: "受案登记表",
        difference:
          "受案登记表留存为内部受案登记记录；受案回执交付报案人一方。决定受理时两者同时制作，不能用受案登记表代替回执。",
      },
    ],
    structure: [
      { heading: "首部", purpose: "记载出具单位、文书编号和出具日期。" },
      { heading: "受案信息", purpose: "记载案件来源、受案时间、案件类别和承办单位。" },
      { heading: "交付与签收", purpose: "记载交付对象、签收情况，或者无法联系、拒绝接受回执的注明。" },
    ],
    annotatedExample: [
      {
        heading: "受案信息",
        fictionalText:
          "案件来源：电话报案；受案时间：2026年3月2日10时；案件类别：行政案件；承办单位：示例派出所。",
        annotations: ["受案时间与受案登记表保持一致，不一致时应当查明原因。"],
      },
      {
        heading: "交付与签收",
        fictionalText: "受案回执已交付报案人王五；交付时间：2026年3月2日10时30分；签收：王五。",
        annotations: [
          "签名使用脱敏或化名体系，不出现真实身份信息。",
          "无法联系或者拒绝接受回执的，应当如实注明，不得代签。",
        ],
      },
    ],
    productionPoints: [
      "决定受理后与受案登记表同时制作，并及时交付。",
      "交付情况如实记载，无法联系或者拒绝接受的情形单独注明。",
    ],
    commonErrors: [
      "只制作受案登记表而不出具受案回执。",
      "代报案人签收或者倒填交付时间。",
    ],
    riskNotes: [
      "受案回执关系报案人知情与救济，交付记录应当完整，由有权民警复核。",
    ],
    formatSource: "《公安机关办理行政案件程序规定》第六十一条（受案回执的制作与交付）",
    sourceIds: [ADMIN_CASE_PROCEDURE.sourceId],
    changeNote: "受控试行首批试行文书范例之一：接报与受理阶段的受案回执。",
    sourceVerificationNote:
      "公安部令第160号修正后的现行文本条款已核对；交付对象、交付方式和无法联系情形均须民警人工核实。",
  }, REVIEW_DUE_30_DAYS),
  example({
    exampleId: ADMIN_INQUIRY_RECORD_ID,
    version: "1.0.0",
    contentStatus: "trial",
    formalName: "询问笔录",
    aliases: ["询问记录", "行政询问笔录"],
    procedureCategory: "administrative",
    stageId: "investigation_evidence",
    documentTypeId: "doc-type-admin-inquiry",
    documentTypeName: "询问笔录",
    caseTags: ["调查取证", "询问", "行政案件"],
    applicableRoles: ["办案民警"],
    applicableScenarios: [
      "对违法嫌疑人、被侵害人或者其他证人进行询问并固定陈述时。",
      "需要区分提问与回答、保留被询问人原始表述和不确定表述时。",
    ],
    exclusions: [
      "刑事案件讯问犯罪嫌疑人的，适用讯问笔录，不适用本笔录。",
      "询问未成年人需要通知监护人到场的，应当在笔录中单独记载到场情况。",
    ],
    prerequisites: [
      "已依法表明执法身份并告知如实提供证据、证言的义务。",
      "已确认被询问人能够正常表达，必要时安排翻译或者合适成年人。",
    ],
    preflightChecks: [
      "被询问人是违法嫌疑人、被侵害人还是证人，是否影响告知内容。",
      "是否属于需要通知监护人到场或者安排翻译的情形。",
      "是否需要对询问过程全程录音、录像。",
    ],
    neighbors: [
      {
        exampleId: CRIMINAL_INTERROGATION_RECORD_ID,
        formalName: "讯问笔录",
        difference:
          "本笔录用于行政案件询问；刑事案件的讯问适用讯问笔录。两者在对象、告知内容、场所和录音录像要求上不同，不得互相替代。",
      },
    ],
    structure: [
      { heading: "首部与义务告知", purpose: "记载询问时间地点、被询问人脱敏称呼和如实提供证据、证言的告知情况。" },
      { heading: "问答正文", purpose: "逐问逐答如实记录，保留口语、模糊表述和不确定程度。" },
      { heading: "核对与确认", purpose: "记载被询问人核对、补充、更正和逐页签名或者捺指印的过程。" },
    ],
    annotatedExample: [
      {
        heading: "首部与义务告知",
        fictionalText:
          "询问时间：2026年3月2日14时至15时；询问地点：示例派出所；被询问人：王五（被侵害人）。已告知如实提供证据、证言和作伪证应负的法律责任。",
        annotations: [
          "告知内容应当逐项记载，不能用“已告知相关权利”概括。",
          "时间精确到分钟，地点写明具体办案场所。",
        ],
      },
      {
        heading: "问答正文",
        fictionalText:
          "问：请说明当时在示例路示例小区发生的情况。答：大约是年初，金额一千多元，具体记不清了。",
        annotations: [
          "模糊时间和金额保留原始表述与精确程度，不静默改写为确定数值。",
          "提问不使用诱导性或者评价性措辞。",
        ],
      },
      {
        heading: "核对与确认",
        fictionalText:
          "以上笔录已向我宣读，我看过，与我陈述一致。被询问人：王五。办案人民警察：张三、李四。",
        annotations: [
          "核对方式如实记载，不得代签。",
          "修改处由被询问人捺指印确认。",
        ],
      },
    ],
    productionPoints: [
      "问答一一对应，不合并、不概括关键表述。",
      "询问未成年人或者需要翻译的，到场情况单独记载。",
      "修改、补充处由被询问人确认，笔录逐页签名或者捺指印。",
    ],
    commonErrors: [
      "把民警归纳写进被询问人回答。",
      "遗漏如实提供证据、证言的告知和核对过程。",
      "行政案件询问使用刑事讯问笔录。",
    ],
    riskNotes: [
      "诱导性提问或者遗漏告知、核对可能影响笔录的证据能力，应当保持中立并依法告知。",
    ],
    formatSource:
      "《公安机关办理行政案件程序规定》第七十四条（询问告知）、第七十五条（未成年人到场）、第七十七条（笔录核对与签名）",
    sourceIds: [ADMIN_CASE_PROCEDURE.sourceId],
    changeNote: "受控试行首批试行文书范例之一：调查取证阶段的行政询问笔录。",
    sourceVerificationNote:
      "公安部令第160号修正后的现行文本条款已核对；是否属于行政案件、是否需要监护人到场或者翻译均须民警结合具体案情判断。",
  }),
  example({
    exampleId: EVIDENCE_COLLECTION_NOTICE_ID,
    version: "1.0.0",
    contentStatus: "trial",
    formalName: "调取证据通知书",
    aliases: ["调取证据通知", "调证通知书"],
    procedureCategory: "administrative",
    stageId: "investigation_evidence",
    documentTypeId: "doc-type-evidence-collection-notice",
    documentTypeName: "调取证据通知书",
    caseTags: ["调查取证", "调取证据", "行政案件"],
    applicableRoles: ["办案民警"],
    applicableScenarios: [
      "需要向有关单位和个人调取与行政案件有关的证据时。",
      "需要明确调取证据的范围、提供时限和签收方式时。",
    ],
    exclusions: [
      "证据可能灭失或者以后难以取得、需要先行登记保存或者扣押的，适用证据保全决定书。",
      "通过询问固定陈述的，适用询问笔录。",
    ],
    prerequisites: [
      "已经公安机关办案部门负责人批准。",
      "已明确需要调取的证据名称、范围和提供时限。",
    ],
    preflightChecks: [
      "是否已经办案部门负责人批准。",
      "调取证据的范围是否与案件有关、是否明确可执行。",
      "是否已告知被调取人如实提供证据的义务和相应法律责任。",
    ],
    neighbors: [
      {
        exampleId: EVIDENCE_PRESERVATION_DECISION_ID,
        formalName: "证据保全决定书",
        difference:
          "调取证据通知书是要求有关单位和个人提供证据的文书；证据保全决定书是在证据可能灭失或者以后难以取得时，经批准先行登记保存或者采取其他保全措施的文书。",
      },
    ],
    structure: [
      { heading: "首部与批准情况", purpose: "记载开具单位、文书编号、批准人和开具日期。" },
      { heading: "调取事项", purpose: "载明调取的证据名称、范围、用途和提供时限。" },
      { heading: "送达与签收", purpose: "记载被调取人盖章或者签名；拒绝签收的注明情况。" },
    ],
    annotatedExample: [
      {
        heading: "调取事项",
        fictionalText:
          "调取证据：示例路示例小区2026年3月1日至3月2日的视频资料；提供时限：自收到本通知书之日起3日内；用途：核实案件有关事实。",
        annotations: [
          "证据范围应当具体、可执行，不写“有关全部资料”等不确定表述。",
          "提供时限应当合理，并考虑证据持有人的实际能力。",
        ],
      },
      {
        heading: "送达与签收",
        fictionalText: "被调取人：王五；签收时间：2026年3月3日9时；签收方式：签名。",
        annotations: ["被调取人拒绝签收的，办案人民警察应当在通知书上注明。"],
      },
    ],
    productionPoints: [
      "先经办案部门负责人批准，再开具通知书。",
      "如实告知如实提供证据的义务和伪造、隐匿、毁灭证据的法律责任。",
      "必要时采用录音、录像等方式固定证据内容及取证过程。",
    ],
    commonErrors: [
      "未写明调取证据的范围和提供时限。",
      "未告知如实提供证据的义务和相应法律责任。",
      "被调取人拒绝签收时未注明。",
    ],
    riskNotes: [
      "调取证据涉及有关单位、个人的权利和义务，程序瑕疵可能影响证据的取得与使用，应当由有权民警复核。",
    ],
    formatSource:
      "《公安机关办理行政案件程序规定》第二十八条（调取证据通知书的批准、内容与签收）",
    sourceIds: [ADMIN_CASE_PROCEDURE.sourceId],
    changeNote: "受控试行首批试行文书范例之一：调查取证阶段的调取证据通知书。",
    sourceVerificationNote:
      "公安部令第160号修正后的现行文本条款已核对；调取范围、时限和对拒绝签收的注明均须民警依法判断。",
  }),
  example({
    exampleId: EVIDENCE_PRESERVATION_DECISION_ID,
    version: "1.0.0",
    contentStatus: "trial",
    formalName: "证据保全决定书",
    aliases: ["先行登记保存决定书", "证据登记保存决定书", "证据保全"],
    procedureCategory: "administrative",
    stageId: "measures_approval",
    documentTypeId: "doc-type-evidence-preservation",
    documentTypeName: "证据保全决定书",
    caseTags: ["措施与审批", "证据保全", HIGH_RISK_CASE_TAG],
    applicableRoles: ["办案民警", "审批负责人"],
    applicableScenarios: [
      "证据可能灭失或者以后难以取得，需要先行登记保存，或者依法采取扣押、扣留、查封、抽样取证等证据保全措施时。",
      "需要当场制作并交付证据保全决定书及清单时。",
    ],
    exclusions: [
      "证据已经固定且无灭失、难以取得风险的，不适用本决定书。",
      "对与违法行为无关的物品、场所不得采取证据保全措施。",
    ],
    prerequisites: [
      "已经公安机关办案部门负责人批准（先行登记保存）。",
      "已会同当事人查点清楚，明确保全的场所、设施、物品名称、规格、数量和特征。",
    ],
    preflightChecks: [
      "是否满足证据可能灭失或者以后难以取得的法定条件。",
      "先行登记保存是否已经办案部门负责人批准。",
      "保全范围和期限是否明确，七日处理期限是否落实。",
      "证据保全清单与实物是否一致，当事人是否到场。",
    ],
    neighbors: [
      {
        exampleId: EVIDENCE_COLLECTION_NOTICE_ID,
        formalName: "调取证据通知书",
        difference:
          "调取证据通知书用于要求有关单位和个人提供证据；证据保全决定书用于对可能灭失或者以后难以取得的证据采取先行登记保存等保全措施。",
      },
      {
        exampleId: INSPECTION_WARRANT_ID,
        formalName: "检查证",
        difference:
          "检查证用于对与违法行为有关的场所、物品、人身进行检查；证据保全决定书用于对已发现或者需要固定的证据采取保全措施，两者依据和程序不同。",
      },
    ],
    structure: [
      { heading: "首部与理由、依据", purpose: "记载决定单位、文书编号、当事人的姓名或者名称、地址及采取保全措施的理由、依据。" },
      { heading: "保全范围与期限", purpose: "逐项列明被保全的场所、设施、物品名称、规格、数量和特征，并写明期限。" },
      { heading: "救济告知与落款", purpose: "说明申请行政复议或者提起行政诉讼的途径和期限，以及决定机关名称、印章和日期。" },
      { heading: "证据保全清单", purpose: "附清单载明保全对象，由办案人民警察、当事人和见证人签名。" },
    ],
    annotatedExample: [
      {
        heading: "保全范围与期限",
        fictionalText:
          "对先行登记保存的示例物品3件（示例物品A一件、示例物品B两件）当场查点清楚，存放于示例派出所证物保管室；期限：自2026年3月3日起7日内作出处理决定。",
        annotations: [
          "物品特征应当具体到可识别，但不填写真实持有人身份信息。",
          "先行登记保存的期限应当符合七日处理的规定，不得自行延长。",
        ],
      },
      {
        heading: "救济告知与落款",
        fictionalText:
          "如不服本决定，可以自收到本决定书之日起六十日内向示例县公安局申请行政复议，或者依法向人民法院提起行政诉讼。决定机关：示例县公安局；日期：2026年3月3日。",
        annotations: [
          "救济途径和期限应当逐项写明，不能概括为“可依法救济”。",
          "机关名称、印章和日期必须齐全，虚构示例统一使用“示例”体系。",
        ],
      },
    ],
    productionPoints: [
      "先审批、后实施，审批记录随卷。",
      "当场会同当事人查点清楚，制作并当场交付证据保全决定书及清单。",
      "对保全的证据或者保全过程拍照、录像，清单与实物一致。",
      "对先行登记保存的证据，应当在七日内作出处理决定。",
    ],
    commonErrors: [
      "先保全后补审批。",
      "决定书未载明理由、依据和期限，或者未附清单。",
      "清单数量、特征与实物不一致。",
      "对先行登记保存的证据逾期未作处理决定。",
    ],
    riskNotes: [
      "证据保全属于高风险程序环节，涉及当事人财产权利，程序瑕疵可能直接影响证据效力，必须由有权民警复核。",
    ],
    formatSource:
      "《公安机关办理行政案件程序规定》第一百一十条（先行登记保存的条件与七日处理期限）、第一百一十一条（证据保全决定书应当载明事项与清单）",
    sourceIds: [ADMIN_CASE_PROCEDURE.sourceId],
    changeNote: "受控试行首批试行文书范例之一：高风险程序环节的证据保全决定书。",
    sourceVerificationNote:
      "公安部令第160号修正后的现行文本条款已核对；是否满足保全条件、期限和清单一致性均须民警人工核验，系统不自动决定。",
  }),
  example({
    exampleId: INSPECTION_WARRANT_ID,
    version: "1.0.0",
    contentStatus: "trial",
    formalName: "检查证",
    aliases: ["行政检查证", "检查证明文件"],
    procedureCategory: "administrative",
    stageId: "measures_approval",
    documentTypeId: "doc-type-inspection-warrant",
    documentTypeName: "检查证",
    caseTags: ["措施与审批", "检查", HIGH_RISK_CASE_TAG],
    applicableRoles: ["办案民警", "审批负责人"],
    applicableScenarios: [
      "为查清行政案件事实，需要对与违法行为有关的场所、物品、人身进行检查时。",
      "需要由县级以上公安机关开具检查证，并载明检查对象和检查人员时。",
    ],
    exclusions: [
      "对机关、团体、企业、事业单位或者公共场所进行日常执法监督检查的，依照有关法律、法规和规章执行，不适用本证。",
      "安全检查不需要开具检查证。",
    ],
    prerequisites: [
      "检查与违法行为有关，且已由县级以上公安机关开具检查证。",
      "检查时人民警察不得少于二人，并持有人民警察证。",
    ],
    preflightChecks: [
      "检查对象是否与违法行为有关。",
      "是否已由县级以上公安机关开具检查证，检查人员是否符合二人要求。",
      "是否属于可以当场检查的情形；检查公民住所是否具备法定紧急条件。",
    ],
    neighbors: [
      {
        exampleId: EVIDENCE_PRESERVATION_DECISION_ID,
        formalName: "证据保全决定书",
        difference:
          "检查证用于对场所、物品、人身进行检查；证据保全决定书用于对证据采取先行登记保存等保全措施。检查中发现需要保全的证据，应当另行依法作出保全决定。",
      },
    ],
    structure: [
      { heading: "首部与开具机关", purpose: "记载开具检查证的县级以上公安机关、文书编号和开具日期。" },
      { heading: "检查对象与依据", purpose: "载明检查的场所、物品或者人身，以及检查的理由和依据。" },
      { heading: "执行与出示", purpose: "记载检查人员、出示人民警察证和检查证的情况，以及检查时间、地点。" },
    ],
    annotatedExample: [
      {
        heading: "检查对象与依据",
        fictionalText:
          "检查对象：示例路示例小区某住宅（与示例案件有关的场所）；检查理由：核实与违法行为有关的场所情况；依据：《公安机关办理行政案件程序规定》第八十二条。",
        annotations: [
          "检查对象应当具体明确，与违法行为有关。",
          "检查公民住所应当特别核对是否具备法定紧急条件，不得以检查证代替法定条件判断。",
        ],
      },
      {
        heading: "执行与出示",
        fictionalText:
          "检查人员：张三、李四（均出示人民警察证及本检查证）；检查时间：2026年3月3日15时至15时40分。",
        annotations: [
          "检查时人民警察不得少于二人。",
          "当场检查的法定情形和检查证适用条件应当分别核对，不相互替代。",
        ],
      },
    ],
    productionPoints: [
      "检查证由县级以上公安机关开具，载明检查对象和依据。",
      "检查时出示人民警察证和检查证，检查人员不得少于二人。",
      "当场检查的，核对是否属于法定情形；检查公民住所的，重点核对紧急条件。",
    ],
    commonErrors: [
      "未持有检查证或者检查人员少于二人即实施检查。",
      "把日常执法监督检查当作案件检查适用本证。",
      "检查公民住所时不核对法定紧急条件。",
    ],
    riskNotes: [
      "检查属于高风险程序环节，涉及公民人身、财产和住宅权利；是否具备当场检查或者检查住所的法定条件必须由有权民警逐项判断，系统不自动认定。",
    ],
    formatSource:
      "《公安机关办理行政案件程序规定》第八十二条（检查的对象、人员、检查证与当场检查条件）",
    sourceIds: [ADMIN_CASE_PROCEDURE.sourceId],
    changeNote: "受控试行首批试行文书范例之一：高风险程序环节的检查证。",
    sourceVerificationNote:
      "公安部令第160号修正后的现行文本条款已核对；检查对象关联性、当场检查与住所检查的法定条件均须民警人工核验。",
  }),
  example({
    exampleId: CRIMINAL_INTERROGATION_RECORD_ID,
    version: "1.0.0",
    contentStatus: "trial",
    formalName: "讯问笔录",
    aliases: ["讯问记录", "刑事讯问笔录"],
    procedureCategory: "criminal",
    stageId: "investigation_evidence",
    documentTypeId: "doc-type-criminal-interrogation",
    documentTypeName: "讯问笔录",
    caseTags: ["调查取证", "讯问", "刑事案件", HIGH_RISK_CASE_TAG],
    applicableRoles: ["侦查人员", "办案民警"],
    applicableScenarios: [
      "对犯罪嫌疑人进行讯问并固定供述与辩解时。",
      "需要记录讯问起止时间、讯问人员、权利告知和到案经过时。",
    ],
    exclusions: [
      "行政案件询问违法嫌疑人的，适用询问笔录，不适用本笔录。",
      "对证人、被害人询问的，适用询问证人、被害人的相关文书。",
    ],
    prerequisites: [
      "已依法告知犯罪嫌疑人诉讼权利，并确认其身份。",
      "讯问由侦查人员进行，讯问人员不得少于二人。",
    ],
    preflightChecks: [
      "是否属于应当在执法办案场所讯问室讯问的情形，或者符合法定例外。",
      "是否属于应当对讯问过程录音录像的案件类型。",
      "是否需要翻译人员或者未成年人的法定代理人、合适成年人到场。",
      "讯问时间、饮食和必要休息时间是否符合规范。",
    ],
    neighbors: [
      {
        exampleId: ADMIN_INQUIRY_RECORD_ID,
        formalName: "询问笔录",
        difference:
          "本笔录用于刑事案件讯问犯罪嫌疑人；行政案件询问适用询问笔录。对象、权利告知、场所和录音录像要求不同，不得互相替代。",
      },
    ],
    structure: [
      { heading: "首部与权利告知", purpose: "记载讯问起止时间、地点、讯问人员，以及告知诉讼权利和认罪认罚规定的情况。" },
      { heading: "问答正文", purpose: "如实记录供述与辩解，保留无罪、罪轻的说明和不确定表述。" },
      { heading: "核对与确认", purpose: "记载犯罪嫌疑人核对、补充、更正、逐页签名捺指印和末页确认语。" },
      { heading: "录音录像说明", purpose: "记载是否对讯问过程录音录像，以及应当录音录像案件的执行情况。" },
    ],
    annotatedExample: [
      {
        heading: "首部与权利告知",
        fictionalText:
          "讯问时间：2026年3月4日9时至10时；讯问地点：示例县公安局执法办案场所讯问室；讯问人：张三、李四；犯罪嫌疑人：王五。已告知诉讼权利和认罪认罚的法律规定。",
        annotations: [
          "讯问人员不得少于二人，且必须是侦查人员。",
          "讯问应当在执法办案场所讯问室进行，符合法定例外情形的另作说明。",
        ],
      },
      {
        heading: "问答正文",
        fictionalText:
          "问：对在示例路示例小区发生的情况有何说明？答：我到过现场，但没有实施指控的行为。",
        annotations: [
          "辩解内容必须完整记录，不得只记录有罪部分。",
          "不得以连续讯问或者刑讯逼供等非法方法获取供述。",
        ],
      },
      {
        heading: "核对与确认",
        fictionalText:
          "以上笔录我看过，和我说的相符。犯罪嫌疑人：王五；侦查人员：张三、李四。",
        annotations: [
          "笔录逐页签名、捺指印，末页写明确认语；拒绝签名的应当注明。",
          "使用能够长期保持字迹的材料记录。",
        ],
      },
    ],
    productionPoints: [
      "讯问由侦查人员进行，讯问人员不得少于二人，同案犯罪嫌疑人个别讯问。",
      "起止时间精确到分钟，保证饮食和必要休息时间并记录在案。",
      "供述和辩解同等记录，笔录逐页签名捺指印。",
      "应当录音录像的案件，对讯问过程全程录音录像。",
    ],
    commonErrors: [
      "遗漏诉讼权利告知或者认罪认罚规定。",
      "对辩解只作概括记录。",
      "应当录音录像而未录音录像，或者讯问人员不符合要求。",
      "在不符合法定例外的场所进行讯问。",
    ],
    riskNotes: [
      "讯问属于高风险程序环节，程序违法可能导致供述被排除；是否应当录音录像、是否需要到场人员必须由有权民警逐项判断，系统不自动认定。",
    ],
    formatSource:
      "《公安机关办理刑事案件程序规定》第一百九十八条（讯问场所）、第二百零三条（讯问顺序与权利告知）、第二百零五条（如实记录）、第二百零六条（核对与签名）、第二百零八条（录音录像）",
    sourceIds: [CRIMINAL_CASE_PROCEDURE.sourceId],
    changeNote: "受控试行首批试行文书范例之一：调查取证阶段的高风险刑事讯问笔录。",
    sourceVerificationNote:
      "公安部令第159号修正后的现行文本条款已核对；讯问场所、到场人员、录音录像和权利告知均须民警结合具体案情人工核验。",
  }),
];

export const DOCUMENT_EXAMPLE_VARIANTS: DocumentExampleRecord[] = EXAMPLES;

export const REQUIRED_DOCUMENT_EXAMPLE_IDS = EXAMPLES.map((item) => item.exampleId);

/**
 * 内部“派出所重点案情 × 文书范例”覆盖矩阵。
 *
 * 矩阵只用于内容建设和发布前覆盖检查，不作为用户可见的覆盖等级或者推荐。
 * 本批为核心程序文书，适用于全部十组重点案情；各组的程序类别与具体情形
 * 仍由报告中的结构化文书任务筛选。矩阵为只读，各行使用独立数组。
 */
export const DOCUMENT_EXAMPLE_COVERAGE_MATRIX: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    "focus-property-telecom-fraud": [...REQUIRED_DOCUMENT_EXAMPLE_IDS],
    "focus-property-theft": [...REQUIRED_DOCUMENT_EXAMPLE_IDS],
    "focus-property-general-fraud": [...REQUIRED_DOCUMENT_EXAMPLE_IDS],
    "focus-public-order-assault": [...REQUIRED_DOCUMENT_EXAMPLE_IDS],
    "focus-public-order-gambling": [...REQUIRED_DOCUMENT_EXAMPLE_IDS],
    "focus-public-order-prostitution": [...REQUIRED_DOCUMENT_EXAMPLE_IDS],
    "focus-public-order-drug": [...REQUIRED_DOCUMENT_EXAMPLE_IDS],
    "focus-property-destruction": [...REQUIRED_DOCUMENT_EXAMPLE_IDS],
    "focus-family-domestic-violence": [...REQUIRED_DOCUMENT_EXAMPLE_IDS],
    "focus-family-minor-harm": [...REQUIRED_DOCUMENT_EXAMPLE_IDS],
  });

/** 每次调用返回全新的可重置内容副本，避免测试之间共享可变状态。 */
export function createDocumentExamples(): DocumentExampleRecord[] {
  return DOCUMENT_EXAMPLE_VARIANTS.map(cloneExample);
}

export function createDocumentExampleSources(): LegalSourceRecord[] {
  return cloneLegalSources(DOCUMENT_EXAMPLE_SOURCES);
}
