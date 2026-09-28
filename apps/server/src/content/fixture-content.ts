import type { ContentReleaseManifest, DocumentExampleRecord, GovernedContentSeed, LegalSourceRecord } from "./model";
import { cloneExample, cloneLegalSources } from "./store";
import {
  createPropertyEconomicCaseFocuses,
  createPropertyEconomicSources,
} from "./property-economic-content";
import {
  createPublicOrderDrugCaseFocuses,
  createPublicOrderDrugSources,
} from "./public-order-drug-content";
import {
  createFamilyMinorCaseFocuses,
  createFamilyMinorSources,
} from "./family-minor-content";

/**
 * 仅用于受控试行功能演示与自动化测试的确定性内容源。
 *
 * 这里的内容不是正式法源或正式文书模板：
 * - 法源标题统一带“[测试法源]”标记，官方链接为空；
 * - 文书范例统一带“[测试]”标记，人物、地址、号码、时间和金额均为虚构；
 * - 全部条目由“受控试行测试内容维护者”核验，只用于验证治理链路与状态门控。
 *
 * 真实首批内容由后续内容发布工作替换，替换时必须重新走核验与发布门槛。
 */

const MAINTAINER = "受控试行测试内容维护者";

function article(location: string, minimalText: string): { location: string; minimalText: string } {
  return { location, minimalText };
}

const ADMIN_SOURCE: LegalSourceRecord = {
  sourceId: "src-test-admin",
  version: "1.0.0",
  title: "[测试法源] 公安行政案件办理程序（测试用）",
  issuingAuthority: "测试发布机关",
  documentNumber: "测试文号〔2026〕1号",
  authorityLevel: "部门规范性文件（测试）",
  region: "国家",
  status: "current",
  publishedAt: "2026-01-10T00:00:00.000Z",
  effectiveAt: "2026-02-01T00:00:00.000Z",
  officialUrl: null,
  retrievedAt: "2026-08-20T00:00:00.000Z",
  contentHash: "test-admin-procedure-v1",
  articles: [
    article("第二十条", "受理案件后，应当制作受案登记，载明案件来源与受理时间。"),
    article("第三十四条", "询问违法嫌疑人，应当制作询问笔录，并由被询问人核对确认。"),
    article("第四十二条", "对可能灭失或者以后难以取得的证据，经批准可以先行登记保存。"),
    article("第六十条", "作出行政处罚决定前，应当告知当事人拟作出的处罚内容及事实、理由、依据。"),
  ],
  lastVerifiedAt: "2026-08-20T00:00:00.000Z",
  nextReviewDueAt: "2027-02-20T00:00:00.000Z",
  maintainer: MAINTAINER,
};

const CRIMINAL_SOURCE: LegalSourceRecord = {
  sourceId: "src-test-criminal",
  version: "1.0.0",
  title: "[测试法源] 公安刑事案件办理程序（测试用）",
  issuingAuthority: "测试发布机关",
  documentNumber: "测试文号〔2026〕2号",
  authorityLevel: "部门规范性文件（测试）",
  region: "国家",
  status: "current",
  publishedAt: "2026-01-10T00:00:00.000Z",
  effectiveAt: "2026-02-01T00:00:00.000Z",
  officialUrl: null,
  retrievedAt: "2026-08-20T00:00:00.000Z",
  contentHash: "test-criminal-procedure-v1",
  articles: [
    article("第二十八条", "讯问犯罪嫌疑人，应当制作讯问笔录，如实记录问答内容。"),
    article("第三十条", "讯问应当个别进行，不得以诱导方式记录。"),
  ],
  lastVerifiedAt: "2026-08-20T00:00:00.000Z",
  nextReviewDueAt: "2027-02-20T00:00:00.000Z",
  maintainer: MAINTAINER,
};

// 测试内容占位：这些场景标识用于验证发布门槛的形状，不代表已执行的测试套件。
// 真实内容发布（#36）必须把场景绑定到实际执行并留存的测试结果。
const COMMON_TEST_RESULTS = [
  { scenarioId: "typical-retrieval", outcome: "pass" as const },
  { scenarioId: "neighboring-non-match", outcome: "pass" as const },
  { scenarioId: "missing-applicability-condition", outcome: "pass" as const },
  { scenarioId: "wrong-procedure-or-role", outcome: "pass" as const },
  { scenarioId: "alias-and-colloquial-search", outcome: "pass" as const },
  { scenarioId: "no-generation-or-export-affordance", outcome: "pass" as const },
  { scenarioId: "fictionalization-and-sensitive-data", outcome: "pass" as const },
  { scenarioId: "source-traceability", outcome: "pass" as const },
  { scenarioId: "withdrawal-expiry-and-disable", outcome: "pass" as const },
  { scenarioId: "old-link-blocking", outcome: "pass" as const },
];

const COMMON_DATES = {
  draftedAt: "2026-08-10T00:00:00.000Z",
  verifiedAt: "2026-08-20T00:00:00.000Z",
  publishedAt: "2026-08-21T00:00:00.000Z",
  lastVerifiedAt: "2026-08-20T00:00:00.000Z",
  nextReviewDueAt: "2026-11-20T00:00:00.000Z",
};

type ExampleSeed = Omit<
  DocumentExampleRecord,
  keyof typeof COMMON_DATES | "maintainer" | "testResults" | "withdrawalNote" | "supersededBy"
> &
  Partial<Pick<DocumentExampleRecord, "withdrawalNote" | "supersededBy">>;

function example(seed: ExampleSeed): DocumentExampleRecord {
  return {
    ...COMMON_DATES,
    maintainer: MAINTAINER,
    testResults: COMMON_TEST_RESULTS.map((result) => ({ ...result })),
    withdrawalNote: null,
    supersededBy: null,
    ...seed,
  };
}

const EXAMPLES: DocumentExampleRecord[] = [
  example({
    exampleId: "doc-test-reception-register",
    version: "1.0.0",
    contentStatus: "trial",
    formalName: "[测试] 受案登记表",
    aliases: ["受案登记", "接报登记表"],
    procedureCategory: "administrative",
    stageId: "reception_acceptance",
    documentTypeId: "doc-type-reception-register",
    documentTypeName: "受案登记表",
    caseTags: ["接报受理", "行政案件", "案件来源"],
    applicableRoles: ["办案民警", "值班民警"],
    applicableScenarios: [
      "以报案、控告、举报、投案或者移送等来源初次受理行政案件时。",
      "需要固定案件来源、受理时间和初步分类时。",
    ],
    exclusions: [
      "属于刑事案件受案范围的，不适用本表。",
      "已由其他有权机关受理且不再由本单位办理的，不适用本表。",
    ],
    prerequisites: [
      "已核实案件来源，并可脱敏记录报案人陈述要点。",
      "已确认案件属于本单位管辖范围。",
    ],
    preflightChecks: [
      "案件来源是否明确且可追溯。",
      "是否属于行政案件受案范围。",
      "是否仍在追究时效内。",
    ],
    neighbors: [
      {
        exampleId: "doc-test-reception-refusal",
        formalName: "[测试] 不予受理告知书",
        difference: "本表用于决定受理并登记；不予受理时应制作告知书并说明理由，不得用本表留白代替。",
      },
    ],
    structure: [
      { heading: "首部", purpose: "记载受理单位、文书编号与受理时间。" },
      { heading: "案件来源", purpose: "说明报案、移送、投案等来源方式及脱敏后的陈述要点。" },
      { heading: "初步分类与承办", purpose: "记载初步判断的案件类别、承办单位和承办人。" },
    ],
    annotatedExample: [
      {
        heading: "首部",
        fictionalText: "受理单位：示例派出所；文书编号：示受字〔2026〕第001号；受理时间：2026年3月2日10时。",
        annotations: [
          "编号规则应与本单位正式登记的编号体系一致，不得自行编造。",
          "时间使用北京时间，精确到分钟。",
        ],
      },
      {
        heading: "案件来源",
        fictionalText: "来源方式：电话报案；报案人示例化名：张三；陈述要点：称在示例路示例号附近发生纠纷。",
        annotations: [
          "报案人身份使用脱敏或化名记录，不得填写真实姓名、证件号和联系方式。",
          "地址只记录到足以确定管辖的层级，不得填写精确门牌。",
        ],
      },
    ],
    productionPoints: [
      "先确认受案范围与管辖，再填写案件来源。",
      "陈述要点按时间顺序摘要，不加入民警推断。",
    ],
    commonErrors: [
      "用本表记录刑事案件的受案信息。",
      "把民警推断写入报案人陈述要点。",
    ],
    riskNotes: [
      "受案范围判断错误可能导致后续程序违法，应由有权民警复核。",
    ],
    formatSource: "[测试] 内部制作规范（测试用）—不是正式格式来源",
    sourceIds: ["src-test-admin"],
    changeNote: "初次发布，用于受控试行功能演示与测试。",
    sourceVerificationNote: "测试法源为 current，条款定位与最小必要原文已核对。",
  }),
  example({
    exampleId: "doc-test-reception-refusal",
    version: "1.0.0",
    contentStatus: "trial",
    formalName: "[测试] 不予受理告知书",
    aliases: ["不予受理", "不予受案告知"],
    procedureCategory: "administrative",
    stageId: "reception_acceptance",
    documentTypeId: "doc-type-refusal-notice",
    documentTypeName: "不予受理告知书",
    caseTags: ["接报受理", "不予受理", "告知"],
    applicableRoles: ["办案民警", "值班民警"],
    applicableScenarios: [
      "经审查认为不属于本单位管辖或者不属于行政案件受案范围，需要书面告知时。",
    ],
    exclusions: [
      "决定受理的，不适用本告知书。",
      "需要移送有权机关的，应制作移送文书而非本告知书。",
    ],
    prerequisites: [
      "已完成受案范围与管辖审查。",
      "已由有权民警确认不予受理理由。",
    ],
    preflightChecks: [
      "不予受理理由是否有明确依据。",
      "是否已告知救济途径。",
    ],
    neighbors: [
      {
        exampleId: "doc-test-reception-register",
        formalName: "[测试] 受案登记表",
        difference: "本告知书用于明确不予受理并说明理由；决定受理时应制作受案登记表。",
      },
    ],
    structure: [
      { heading: "首部", purpose: "记载告知单位、文书编号与被告知人脱敏称呼。" },
      { heading: "审查结论与理由", purpose: "写明不予受理的结论及其对应依据。" },
      { heading: "救济告知与落款", purpose: "说明可采取的救济途径、期限和落款时间。" },
    ],
    annotatedExample: [
      {
        heading: "审查结论与理由",
        fictionalText: "经审查，你于2026年3月2日反映的事项不属于本单位管辖，依据示例条款告知如下。",
        annotations: [
          "理由必须对应具体条款，不得只写“不符合规定”。",
          "不得在文书中复述完整案情细节。",
        ],
      },
    ],
    productionPoints: [
      "先完成审查，再制作告知书。",
      "救济途径和期限应逐项写清，避免使用概括表述。",
    ],
    commonErrors: [
      "只写结论不写依据条款。",
      "把不予受理与移送混为一份文书。",
    ],
    riskNotes: [
      "不予受理直接影响当事人权利，应经有权民警复核后送达。",
    ],
    formatSource: "[测试] 内部制作规范（测试用）—不是正式格式来源",
    sourceIds: ["src-test-admin"],
    changeNote: "初次发布，用于受控试行功能演示与测试。",
    sourceVerificationNote: "测试法源为 current，条款定位与最小必要原文已核对。",
  }),
  example({
    exampleId: "doc-test-admin-inquiry",
    version: "1.0.0",
    contentStatus: "trial",
    formalName: "[测试] 询问笔录",
    aliases: ["询问记录", "行政询问笔录"],
    procedureCategory: "administrative",
    stageId: "investigation_evidence",
    documentTypeId: "doc-type-admin-inquiry",
    documentTypeName: "询问笔录",
    caseTags: ["调查取证", "询问", "行政案件"],
    applicableRoles: ["办案民警"],
    applicableScenarios: [
      "对违法嫌疑人和证人进行询问并固定陈述时。",
      "需要区分提问与回答、保留原始表述时。",
    ],
    exclusions: [
      "刑事案件讯问犯罪嫌疑人的，使用讯问笔录。",
      "询问不满十六周岁未成年人需要通知监护人在场的，应在笔录中单独记载。",
    ],
    prerequisites: [
      "已依法表明执法身份并告知权利义务。",
      "已确认被询问人可以正常表达。",
    ],
    preflightChecks: [
      "被询问人是嫌疑人还是证人，是否影响告知内容。",
      "是否属于需要监护人或合适成年人在场的情形。",
      "是否存在需要同步录音录像的情形。",
    ],
    neighbors: [
      {
        exampleId: "doc-test-criminal-interrogation",
        formalName: "[测试] 讯问笔录",
        difference: "本笔录用于行政案件询问；刑事案件的讯问适用讯问笔录，告知内容和程序要求不同。",
      },
    ],
    structure: [
      { heading: "首部与权利义务告知", purpose: "记载询问时间地点、被询问人脱敏称呼和告知事项。" },
      { heading: "问答正文", purpose: "逐问逐答如实记录，保留口语和不确定表述。" },
      { heading: "核对与确认", purpose: "记载被询问人核对、补充和确认的过程。" },
    ],
    annotatedExample: [
      {
        heading: "问答正文",
        fictionalText: "问：请说明当时的情况。答：大约是年初，金额一千多元，具体记不清了。",
        annotations: [
          "模糊时间和金额应保留原始表述与精确程度，不得改写为确定数值。",
          "提问不得使用诱导性或评价性措辞。",
        ],
      },
      {
        heading: "核对与确认",
        fictionalText: "以上笔录已向我宣读，我看过，与我陈述一致。被询问人：示例化名李四。",
        annotations: [
          "核对方式应如实记载，不得代签。",
          "签名处使用脱敏或化名体系，不出现真实身份信息。",
        ],
      },
    ],
    productionPoints: [
      "问答一一对应，不合并、不概括关键表述。",
      "记录修改处应由被询问人确认。",
    ],
    commonErrors: [
      "把民警归纳写进被询问人回答。",
      "遗漏权利义务告知和核对过程。",
    ],
    riskNotes: [
      "诱导性提问可能导致笔录不能作为定案参考，应保持中立。",
    ],
    formatSource: "[测试] 内部制作规范（测试用）—不是正式格式来源",
    sourceIds: ["src-test-admin"],
    changeNote: "初次发布，用于受控试行功能演示与测试。",
    sourceVerificationNote: "测试法源为 current，条款定位与最小必要原文已核对。",
  }),
  example({
    exampleId: "doc-test-criminal-interrogation",
    version: "1.0.0",
    contentStatus: "trial",
    formalName: "[测试] 讯问笔录",
    aliases: ["讯问记录", "刑事讯问笔录"],
    procedureCategory: "criminal",
    stageId: "investigation_evidence",
    documentTypeId: "doc-type-criminal-interrogation",
    documentTypeName: "讯问笔录",
    caseTags: ["调查取证", "讯问", "刑事案件"],
    applicableRoles: ["办案民警", "侦查人员"],
    applicableScenarios: [
      "对犯罪嫌疑人进行讯问并固定供述与辩解时。",
      "需要记录讯问起止时间和权利告知时。",
    ],
    exclusions: [
      "行政案件询问违法嫌疑人的，使用询问笔录。",
      "需要同步录音录像而未具备条件的，应按规范先行处理。",
    ],
    prerequisites: [
      "已依法告知权利并确认犯罪嫌疑人身份。",
      "讯问人员数量与身份符合要求。",
    ],
    preflightChecks: [
      "是否属于必须同步录音录像的案件类型。",
      "是否需要翻译或者合适成年人在场。",
      "讯问时间和地点是否符合规范。",
    ],
    neighbors: [
      {
        exampleId: "doc-test-admin-inquiry",
        formalName: "[测试] 询问笔录",
        difference: "本笔录用于刑事案件讯问；行政案件询问适用询问笔录，权利告知与程序要求不同。",
      },
    ],
    structure: [
      { heading: "首部与权利告知", purpose: "记载讯问起止时间、地点、人员与权利告知情况。" },
      { heading: "问答正文", purpose: "如实记录供述与辩解，保留无罪、罪轻的说明。" },
      { heading: "核对与确认", purpose: "记载核对、补充、更正和确认过程。" },
    ],
    annotatedExample: [
      {
        heading: "问答正文",
        fictionalText: "问：对上述指控有何说明？答：我承认到过现场，但没有实施指控的行为。",
        annotations: [
          "辩解内容必须完整记录，不得只记录有罪部分。",
          "不得以连续讯问方式获取供述。",
        ],
      },
    ],
    productionPoints: [
      "起止时间精确到分钟。",
      "供述和辩解同等记录。",
    ],
    commonErrors: [
      "遗漏权利告知。",
      "对辩解只作概括记录。",
    ],
    riskNotes: [
      "讯问程序违法可能导致供述被排除，应严格按规范执行。",
    ],
    formatSource: "[测试] 内部制作规范（测试用）—不是正式格式来源",
    sourceIds: ["src-test-criminal"],
    changeNote: "初次发布，用于受控试行功能演示与测试。",
    sourceVerificationNote: "测试法源为 current，条款定位与最小必要原文已核对。",
  }),
  example({
    exampleId: "doc-test-evidence-preservation",
    version: "1.0.0",
    contentStatus: "trial",
    formalName: "[测试] 证据保全决定书",
    aliases: ["先行登记保存决定书", "证据登记保存"],
    procedureCategory: "administrative",
    stageId: "measures_approval",
    documentTypeId: "doc-type-evidence-preservation",
    documentTypeName: "证据保全决定书",
    caseTags: ["措施与审批", "证据保全", "高风险环节"],
    applicableRoles: ["办案民警", "审批负责人"],
    applicableScenarios: [
      "证据可能灭失或者以后难以取得，需要先行登记保存时。",
      "需要记录保全范围、期限和存放方式时。",
    ],
    exclusions: [
      "证据已经固定且无灭失风险的，不适用本决定书。",
      "涉及查封、扣押等其他措施的，适用对应的措施文书。",
    ],
    prerequisites: [
      "已取得有权负责人批准。",
      "已清点证据并制作清单。",
    ],
    preflightChecks: [
      "是否满足先行登记保存的法定条件。",
      "保全期限是否明确且在法定期限内。",
      "清单与实物是否一致。",
    ],
    neighbors: [],
    structure: [
      { heading: "首部与依据", purpose: "记载决定单位、文书编号、作出决定的事实与依据。" },
      { heading: "保全范围与期限", purpose: "逐项列明证据名称、数量、特征、存放地点和期限。" },
      { heading: "告知与落款", purpose: "说明救济途径、审批记录和落款时间。" },
    ],
    annotatedExample: [
      {
        heading: "保全范围与期限",
        fictionalText: "先行登记保存示例物品3件，存放于示例保管室，期限自2026年3月3日起7日。",
        annotations: [
          "物品特征应具体到可识别，但不得填写真实持有人身份信息。",
          "期限必须与依据条款一致，不得自定义。",
        ],
      },
    ],
    productionPoints: [
      "先审批后实施，审批记录随卷。",
      "清点、封存、交接环节均应有书面记录。",
    ],
    commonErrors: [
      "先保全后补审批。",
      "清单数量与实物不一致。",
    ],
    riskNotes: [
      "证据保全属于高风险程序环节，程序瑕疵可能直接影响证据效力，必须由有权民警复核。",
    ],
    formatSource: "[测试] 内部制作规范（测试用）—不是正式格式来源",
    sourceIds: ["src-test-admin"],
    changeNote: "初次发布，用于受控试行功能演示与测试。",
    sourceVerificationNote: "测试法源为 current，条款定位与最小必要原文已核对。",
  }),
];

const RELEASE: ContentReleaseManifest = {
  releaseId: "release-test-0001",
  version: "1.0.0",
  activatedAt: "2026-08-22T00:00:00.000Z",
  maintainer: MAINTAINER,
  changeNote:
    "受控试行测试内容首批激活；同时装载财产与经济类、治安秩序与毒品类、家庭与未成年人高风险派出所重点案情内容包。",
  items: EXAMPLES.map((item) => ({ exampleId: item.exampleId, version: item.version })),
  caseFocuses: [],
  legalSources: [ADMIN_SOURCE, CRIMINAL_SOURCE].map((source) => ({
    sourceId: source.sourceId,
    version: source.version,
  })),
  testSummary: "全部测试内容通过典型检索、相邻不匹配、虚构化与旧链接阻断检查。",
};

/** 按 sourceId 合并多个内容包的法源，后出现的记录覆盖先出现的同名记录。 */
function mergeSources(...groups: LegalSourceRecord[][]): LegalSourceRecord[] {
  const byId = new Map<string, LegalSourceRecord>();
  for (const group of groups) {
    for (const source of group) byId.set(source.sourceId, source);
  }
  return [...byId.values()];
}

/**
 * 每次调用返回全新的可重置种子，避免测试之间共享可变状态。
 *
 * 除占位文书范例与测试法源外，种子同时装载财产与经济类、治安秩序与毒品类、
 * 家庭与未成年人高风险派出所重点案情内容包（真实国家公开法源）；这些内容包
 * 是第 33、34、35 号切片的交付物，文书范例的正式内容由第 36 号切片另行发布。
 */
export function createFixtureContent(): GovernedContentSeed {
  const caseFocuses = [
    ...createPropertyEconomicCaseFocuses(),
    ...createPublicOrderDrugCaseFocuses(),
    ...createFamilyMinorCaseFocuses(),
  ];
  const sources = mergeSources(
    [ADMIN_SOURCE, CRIMINAL_SOURCE],
    createPropertyEconomicSources(),
    createPublicOrderDrugSources(),
    createFamilyMinorSources(),
  );

  return {
    sources: cloneLegalSources(sources),
    examples: EXAMPLES.map(cloneExample),
    caseFocuses,
    release: {
      ...RELEASE,
      items: RELEASE.items.map((entry) => ({ ...entry })),
      caseFocuses: caseFocuses.map((focus) => ({
        caseFocusId: focus.caseFocusId,
        version: focus.version,
      })),
      legalSources: sources.map((source) => ({
        sourceId: source.sourceId,
        version: source.version,
      })),
    },
  };
}
