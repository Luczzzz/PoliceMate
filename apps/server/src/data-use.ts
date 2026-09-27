import type { DataUseResponse, DataUseSection, DataUseServiceInfo } from "@policymate/contracts";

/**
 * 使用与数据说明的必需章节。受控试行前必须替换所有主体、联系人和说明占位信息；
 * 未配置的部署信息以 `null` 暴露并在页面如实显示。
 */
export const DATA_USE_SECTION_IDS = [
  "purpose",
  "desensitization",
  "dify",
  "lifetime",
  "metadata",
  "logging",
  "distribution",
  "feedback",
] as const;

export type DataUseSectionId = (typeof DATA_USE_SECTION_IDS)[number];

type SectionContent = Omit<DataUseSection, "id">;

const SECTIONS: Record<DataUseSectionId, SectionContent> = {
  purpose: {
    title: "程序辅助工具边界",
    paragraphs: [
      "松警伴侣是面向公安一线民警的程序辅助工具，提供案情研判辅助与文书制作指导。",
      "它不创建官方案件记录、电子案卷或业务台账，不作出受案、立案、定性、处罚、审批或其他执法决定，也不生成、审批或制发正式法律文书。",
      "全部输出均为供民警核验的辅助内容，必须结合现行规范、正式案卷、公安业务系统和有权民警判断。",
    ],
    bullets: [],
  },
  desensitization: {
    title: "脱敏义务",
    paragraphs: [
      "请勿输入姓名、身份证号、手机号、精确住址等真实身份信息；条文与范例中的人物、地址、号码、时间和金额均为虚构。",
      "本产品不做自动脱敏扫描、自动替换或高风险字段阻断，也不承诺已对提交内容完成脱敏。是否完成脱敏由使用者负责。",
    ],
    bullets: [],
  },
  dify: {
    title: "内容提交与 Dify 处理",
    paragraphs: [
      "案情正文、追问答案等提交内容会经 PoliceMate 后端发送至 Dify（大模型应用编排服务）处理，用于生成候选事实、追问和分析结果。",
      "Dify API 密钥只保存在 PoliceMate 后端，移动端 H5 不会直接连接 Dify。",
      "提交前请自行权衡内容范围；本产品不对模型服务侧的处理过程或留存形态作额外承诺。",
    ],
    bullets: [],
  },
  lifetime: {
    title: "当前标签页生命周期",
    paragraphs: [
      "本次分析仅属于当前浏览器标签页：不跨标签页、不跨设备，也不形成分析历史。",
      "刷新、关闭标签页、主动清除本次分析或空闲 30 分钟后，当前内容不可恢复；浏览器未显示离开提醒时，本产品不承诺恢复任何内容。",
    ],
    bullets: [],
  },
  metadata: {
    title: "允许记录的非内容元数据",
    paragraphs: [
      "为排查故障和评估试行，后端可以记录不含案情内容的运行元数据，且不得用于恢复案情会话或反推案情内容：",
    ],
    bullets: [
      "随机请求编号、时间与耗时",
      "状态与错误分类",
      "契约版本、工作流版本与内容发布批次",
      "输入输出字符数",
      "重试、取消和限流事件",
      "已匹配的法源记录 ID",
      "页面或功能状态的匿名计数",
    ],
  },
  logging: {
    title: "技术日志与第三方服务边界",
    paragraphs: [
      "案情正文、事实值、候选事实与事实快照正文、追问答案、报告正文、Dify 原始响应、文书检索词和临时工作台标记不写入业务数据库、分析历史、知识库、训练集、可回放日志或第三方分析工具。",
      "第三方服务或部署环境（例如云主机、接口网关、模型编排服务）仍可能在基础设施层产生技术日志。本产品不接入会读取页面文本的会话重放、热图、录屏或行为分析 SDK。",
    ],
    bullets: [],
  },
  distribution: {
    title: "分发与访问说明",
    paragraphs: [
      "本产品通过定向提供的不公开网址分发。不公开网址只是分发控制，不构成身份认证、权限控制或保密访问；知道网址的人均可能访问。",
      "页面已设置 noindex 等降低搜索引擎收录概率的措施，但这类措施不能阻止网址传播。旧试行地址可以被停止并更换。",
      "访问本页面不代表已经通过身份核验，请勿依赖网址隐蔽性处理敏感内容。",
    ],
    bullets: [],
  },
  feedback: {
    title: "反馈与数据处理说明",
    paragraphs: [
      "结构化反馈只提交预定义类型和不含案情的元数据；需要进一步排查时，由试行组织者另行联系。",
      "实际服务提供者、试行反馈联系人和适用的数据处理说明见下方信息块。",
    ],
    bullets: [],
  },
};

export function buildDataUseResponse(
  service: DataUseServiceInfo,
  contractVersion: string,
): DataUseResponse {
  return {
    contractVersion,
    title: "使用与数据说明",
    sections: DATA_USE_SECTION_IDS.map((id) => {
      const section = SECTIONS[id];
      return {
        id,
        title: section.title,
        paragraphs: [...section.paragraphs],
        bullets: [...section.bullets],
      };
    }),
    service: {
      provider: service.provider,
      contact: service.contact,
      dataProcessingStatement: service.dataProcessingStatement,
      technicalLoggingBoundary: [...service.technicalLoggingBoundary],
    },
  };
}
