import type {
  CandidateFact,
  EvidencePriority,
  ReportEvidenceChecklistItem,
  ReportInterviewPointItem,
  ReportModule,
  ReportModuleId,
  ReportTraceLink,
} from "@policymate/contracts";
import {
  EVIDENCE_HOLDING_STATUS_LABELS,
  EVIDENCE_PRIORITY_LABELS,
  REPORT_MODULE_LABELS,
} from "@policymate/contracts";
import { focusMatchingFacts } from "../content/case-focus";
import type { ReportGenerationRequest, ReportGenerationResult } from "../providers/types";

export const ASSAULT_REPORT_VERSION = "assault-actionable-v1";

/** 仅在当前法源可用、没有冲突且报告正常生成时细化殴打案报告。 */
export function buildAssaultReport(
  request: ReportGenerationRequest,
  base: ReportGenerationResult,
): ReportGenerationResult {
  const facts = focusMatchingFacts(request.facts);
  const behavior = facts.find((fact) => fact.category === "behavior" && fact.value?.raw === "殴打推搡");
  if (behavior === undefined) return base;
  const byCategory = (category: CandidateFact["category"]) => facts.filter((fact) => fact.category === category);
  const place = byCategory("place")[0]?.value?.raw ?? "案发现场";
  const time = byCategory("time")[0]?.value?.raw ?? "报案所述时段";
  const drinking = byCategory("background").some((fact) => /喝酒|饮酒|醉酒/.test(fact.value?.raw ?? ""));
  const reported = /报警|报案/.test(behavior.originalWording);
  const injuryFacts = byCategory("result");
  const injuryMissing = injuryFacts.length === 0 || request.unresolvedGapIds?.includes("gap-injury") === true;
  const criminalInjury = injuryFacts.some((fact) => /重伤|轻伤/.test(fact.value?.raw ?? fact.statement) && !/轻微伤|未达到?轻伤|不构成轻伤/.test(fact.value?.raw ?? fact.statement));
  const qualifiedInjury = injuryFacts.some((fact) => /鉴定/.test(fact.originalWording));
  const direction = criminalInjury
    ? "初步方向：涉嫌故意伤害，应重点审查刑事办理条件。"
    : "初步方向：涉嫌殴打他人，可先按治安案件方向调查。";
  const injuryNote = injuryMissing
    ? "伤情未提到，不等于无伤情；现有信息不能排除轻伤以上后果，也不能据此认定未达到刑事标准。"
    : qualifiedInjury
      ? "输入提到伤情鉴定，应核对鉴定意见原件、形成程序及伤害因果关系，再判断刑事办理条件。"
      : "输入中的伤情是当事人表述，并非损伤程度鉴定结论；不得仅凭“擦伤”“受伤”等描述排除刑事方向。";

  const basis = (sourceId: string, article: string): NonNullable<ReportTraceLink["basis"]> => {
    const source = request.legalSources.find((item) => item.sourceId === sourceId && item.status === "current");
    const clause = source?.articles.find((item) => item.location === article);
    if (source === undefined || clause === undefined) throw new Error(`殴打案报告缺少法源条款：${sourceId} ${article}`);
    return {
      sourceId: source.sourceId, version: source.version, title: source.title,
      issuingAuthority: source.issuingAuthority, documentNumber: source.documentNumber,
      article: clause.location, minimalText: clause.minimalText,
      status: source.status, region: source.region, publishedAt: source.publishedAt,
      lastVerifiedAt: source.lastVerifiedAt, retrievedAt: source.retrievedAt,
      officialUrl: source.officialUrl,
    };
  };
  const trace = (sourceId: string, article: string, condition: string, judgment: string): ReportTraceLink => ({
    factIds: facts.filter((fact) => ["behavior", "time", "place", "result", "background"].includes(fact.category)).map((fact) => fact.factId),
    factReferences: [], condition, judgment,
    conditionStatus: "unknown", basis: basis(sourceId, article), basisKind: "formal_basis",
  });
  const punishmentSource = "src-cn-public-security-punishments";
  const procedureSource = "src-cn-mps-admin-procedure";
  const qualificationTraces = [
    trace(punishmentSource, "第五十一条", "殴打行为属实，且尚不构成犯罪", direction),
    trace("src-cn-criminal-law", "第二百三十四条", "伤害故意、损伤程度及因果关系等刑事条件得到证实", "达到刑事办理条件时，按故意伤害方向办理，不能因已按行政程序调查而排除刑事路径。"),
  ];
  const filingTraces = [
    trace(procedureSource, "第六十条", "接到报案、控告等线索", "及时受理并登记，不把伤情鉴定作为接报案的前置条件。"),
    trace(procedureSource, "第六十一条", "属于本单位管辖范围", "立即调查处理，制作受案登记表并交付受案回执。"),
    trace(procedureSource, "第六十五条", "暂时不能确定刑事或行政性质", "可以先按行政程序办理；涉嫌犯罪时转换刑事程序。"),
    trace(punishmentSource, "第九十条", "报案线索属于违反治安管理案件", "适用现行治安管理处罚法关于立案调查的规定，不能把受理与最终违法认定混同。"),
  ];
  const riskTraces = [
    trace(punishmentSource, "第九十六条", "确有传唤接受调查的需要", "书面传唤须履行批准手续；现场发现的行为人可以依法口头传唤，出示证件并记明。"),
    trace(punishmentSource, "第九十七条", "传唤后询问查证及在执法办案场所询问", "按八小时、十二小时、二十四小时各自条件管理时限；在执法办案场所询问应全程同步录音录像。"),
    trace(procedureSource, "第九十条", "可能轻伤以上、被侵害人要求鉴定或伤害程度存在争议", "依法进行伤情鉴定；不是所有殴打报案一律自动鉴定。"),
    trace(punishmentSource, "第九条", "因民间纠纷引起，情节较轻，且具备合法、自愿等调解条件", "不能仅凭双方同意就以治安调解代替依法调查处理。"),
    trace(punishmentSource, "第十九条", "存在制止正在进行的不法侵害的抗辩", "核实先后顺序、必要限度，不把防卫行为自动记作互殴。"),
  ];
  if (drinking) {
    riskTraces.push(
      trace(punishmentSource, "第十五条", "饮酒表述须核实为醉酒且存在现实危险或威胁", "饮酒不是免责理由，也不能仅因喝酒就采取保护性约束。"),
      trace(procedureSource, "第五十八条", "醉酒状态下对本人或他人存在危险、威胁", "保护性约束须满足条件，安排看护并在酒醒后解除；保护性约束与询问查证分别记录。"),
    );
  }
  const evidence = (itemId: string, text: string, priority: EvidencePriority, purpose: string, sourceHint: string, preservationRisk: string | null): ReportEvidenceChecklistItem => ({
    itemId, text, purpose, sourceHint, preservationRisk, priority,
    priorityLabel: EVIDENCE_PRIORITY_LABELS[priority], holdingStatus: "unknown",
    holdingStatusLabel: EVIDENCE_HOLDING_STATUS_LABELS.unknown,
  });
  const evidenceItems = [
    evidence("ev-01", `优先调取${place}及周边监控，先核对${time}是报警时间还是案发时间，再覆盖事发前后完整时段。`, "high",
      "确认谁先动手、打击方式、持续时间、是否持械及是否存在防卫。", "场所监控管理人、在场人员手机拍摄。", "录像可能被循环覆盖；保留原始载体、提取过程和时间校准信息。"),
    evidence("ev-02", "记录伤情并收集伤情照片、就诊记录、诊断证明；符合伤情鉴定条件时依法鉴定。", "medium",
      "确认损伤部位、程度、形成时间和与行为的因果关系。", "被侵害人、医疗机构及依法形成的鉴定意见。", null),
    evidence("ev-03", "分别询问双方及直接目击者，记录各自陈述、信息来源、相符点和矛盾点。", "low",
      "区分单方殴打、互殴、防卫及其他行为，不把听说当作亲见。", /酒店|宾馆/.test(place) ? "酒店前台、安保、同桌人员及其他直接目击者（是否目击需核实）。" : "现场工作人员及直接目击者（是否存在需核实）。", null),
    evidence("ev-04", "如现场存在涉案工具、血迹或破损衣物，依法拍照、提取和保全；没有发现的，不写成已取得。", "medium",
      "印证打击工具、部位及后果，与陈述和视频交叉核对。", "现场勘验、当事人依法提交的实物。", "注意物品同一性、污染风险及保管流转记录。"),
  ];
  const questions = (itemId: string, role: string, roleLabel: string, topic: string, text: string): ReportInterviewPointItem => ({ itemId, role, roleLabel, topic, text });
  const interviewItems = [
    questions("iv-01", "suspect", "被指称实施行为的人", "经过与辩解",
      `请从到达${place}开始叙述事情经过。双方是什么关系，争执因何而起？各自做了什么，先后顺序如何？是否使用工具？有什么辩解或可以支持你陈述的证据？`),
    questions("iv-02", "witness", "证人", "亲见与信息来源",
      `你在${place}的什么位置，亲眼看到、亲耳听到什么？谁先实施了什么行为，是否持械？哪些内容是转述？是否有其他目击者或录像？`),
    questions("iv-03", "reporter", "报案人／被侵害人", "报案与伤情",
      `请叙述事发和报警经过，${time}指报警还是事发时间？对方以什么方式接触、打击哪些部位？目前有哪些不适，是否就医？有哪些证据、证人，是否要求伤情鉴定？`),
    questions("iv-04", "suspect", "被指称实施行为的人", "反向事实",
      "事前是否存在威胁或侵害，谁先动手，是否为制止正在发生的侵害？冲突停止后有无继续行为？是否有其他参与者或既往同类行为？"),
    questions("iv-05", "reporter", "报案人／被侵害人", "纠纷与诉求",
      "双方此前是否有纠纷，是否还有威胁或报复风险？你的处理和赔偿诉求是什么？如属于依法可以调解的范围，是否自愿参与调解？"),
  ];
  if (drinking) interviewItems.push(questions("iv-06", "suspect", "被指称实施行为的人", "饮酒与安全",
    "当天何时、何处饮酒，饮了什么、多少，与谁一起？是否还能清楚回忆经过？当前是否有身体不适、失控或威胁他人情形，有什么材料可以印证？"));

  const module = (id: ReportModuleId, summary: string, items: string[], traceLinks: ReportTraceLink[], extra: Partial<ReportModule> = {}): ReportModule => ({
    id, label: REPORT_MODULE_LABELS[id], status: "present", summary, items, traceLinks,
    failureReason: null, evidenceItems: [], interviewItems: [], ...extra,
  });
  const evidenceTraces = [trace(procedureSource, "第二十八条", "需要向单位或个人调取证据", "履行调取手续，明确内容和提供时限。")];
  const interviewTraces = [trace(procedureSource, "第七十四条", "进行询问", "告知如实提供证据和证言的义务，避免预设有罪或诱导回答。")];
  const allTraces = [...qualificationTraces, ...filingTraces, ...evidenceTraces, ...interviewTraces, ...riskTraces];
  const seen = new Set<string>();
  const legalTraces = allTraces.filter((entry) => {
    const key = `${entry.basis!.sourceId}:${entry.basis!.article}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    ...base,
    headline: criminalInjury ? "涉嫌故意伤害，重点审查刑事办理条件" : "涉嫌殴打他人，先受理调查，同步查明伤情",
    workflowVersion: ASSAULT_REPORT_VERSION,
    documentTasks: criminalInjury ? [] : base.documentTasks,
    participantBehaviorSummary: facts.filter((fact) => fact.category === "behavior").map((fact) => ({
      participant: fact.participantRefs.join("、") || "相关人员",
      behavior: `${fact.value?.raw ?? "行为线索"}（角色按原文核对）`,
      factIds: [fact.factId], note: fact.statement,
    })),
    modules: [
      module("preliminary_qualification", direction, [
        `支持线索：${behavior.statement}；地点为${place}。这些是输入陈述，不是已查明事实。`,
        injuryNote,
        "转换条件：伤害故意、损伤程度及因果关系等达到刑事办理条件时，按故意伤害方向办理；轻伤以上应重点审查刑事条件。如有无事生非、聚众斗殴等线索，再分别评价，不能只因发生在酒店或公共场所就推定寻衅滋事。",
        "反向核查：是否存在正当防卫、误认行为人、单方陈述或其他参与者；处罚适用需结合年龄、行为情节及全部证据，不据简短输入推荐处罚档次。",
      ], qualificationTraces),
      module("filing_conditions", reported ? "办理建议：建议及时受理报案并登记，核实管辖后开展调查，不等待伤情鉴定才接报。" : "办理建议：及时登记发现的殴打线索，核实管辖并调查。", [
        "受理与管辖：属本单位管辖的，按规定制作受案登记表、交付受案回执；不属本单位管辖的，按现行规定移送并告知，紧急事项先采取必要处置。",
        "行政调查与刑事转换：暂不能确定刑事或行政性质的，可以先按行政案件程序办理；涉嫌犯罪时转换刑事程序。受理报案不等于已经确认违法或满足刑事立案条件。",
        "治安立案调查：符合违反治安管理案件条件的，适用现行治安管理处罚法第九十条；是否属于本单位管辖、是否构成违法和刑事条件，分别查明。",
      ], filingTraces),
      module("evidence_checklist", "先固定易灭失的现场证据，再查伤情与行为过程；以下掌握状态均待核实。", [], evidenceTraces, { evidenceItems }),
      module("interview_points", "按被指称行为人、报案人／被侵害人、证人分别询问，先开放叙述，再核对矛盾。", [], interviewTraces, { interviewItems }),
      module("enforcement_risks", "重点控制证据灭失、伤情漏查、传唤时限与程序误用。", [
        "程序范围：下列治安传唤、询问查证时限适用于行政调查阶段；转入刑事程序后，按刑事程序另行确定措施、讯问要求和期限，不能继续套用行政规则。",
        "传唤：核对批准手续、告知及家属通知；现场口头传唤须出示证件并在笔录记明，不以通知证人代替传唤行为人。",
        "询问查证：通常不超过八小时；涉案人数众多或身份不明适用十二小时条件；情况复杂且可能行政拘留的适用二十四小时条件，不连续传唤变相拘禁。",
        "在执法办案场所询问违反治安管理行为人，应全程同步录音录像；保障饮食、必要休息，及时通知家属，记录到离时间。",
        "伤情鉴定：可能达到轻伤以上、被侵害人要求鉴定或双方对伤害程度有争议时依法鉴定，不能先按无伤情作出结案判断。",
        ...(drinking ? ["酒后安全：饮酒不等于醉酒失控，不是自动免责或加重理由；只有核实醉酒状态下存在现实危险或威胁时，才依法采取保护性措施并看护，酒醒后解除。"] : []),
        "调解：先查清起因、情节及合法适用条件，不能仅凭双方同意就适用治安调解；涉嫌犯罪不能以调解替代刑事程序。",
      ], riskTraces),
      module("legal_basis_trace", "以下为本次分析实际引用的法条原文节选；处罚幅度是法律规定，不是对本案的处罚建议。",
        legalTraces.map((entry) => `《${entry.basis!.title}》${entry.basis!.article}：${entry.basis!.minimalText}`), legalTraces),
    ],
  };
}
